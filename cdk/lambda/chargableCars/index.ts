import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { APIGatewayEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult, Context } from 'aws-lambda';
import fetch, { Response } from 'node-fetch';


const ssm = new SSMClient({ });

class ParseError extends Error { };
class NetworkingError extends Error { };

type Car = {
    carId: number;
    age: number;
    title: string;
    lat: number;
    lon: number;
    licencePlate: string;
    fuelLevel: number;
    vehicleStateId: number;
    vehicleTypeId: number;
    pricingTime: string;
    pricingParking: string;
    reservationState: number;
    address: string;
    zipCode: string;
    city: string;
    locationId: number;
};

type Position = {
    lat: number;
    lon: number;
}

async function getParameter(name: string): Promise<string> {
    try {
        const command = new GetParameterCommand({ Name: `/greenmo/${name}` });
        return (await ssm.send(command)).Parameter?.Value ?? '';
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function getPossitions(parameters: APIGatewayProxyEventQueryStringParameters | null): [Position, Position] {
    if (!parameters) {
        const errMsg = 'The query parameters are missing.'
        throw new ParseError(errMsg);
    }

    const pos1: Position = {
        lat: parseFloat(parameters['lat1'] as string),
        lon: parseFloat(parameters['lon1'] as string),
    }

    const pos2: Position = {
        lat: parseFloat(parameters['lat2'] as string),
        lon: parseFloat(parameters['lon2'] as string),
    }
    
    if (isNaN(pos1.lon) || isNaN(pos1.lat) || isNaN(pos2.lon) || isNaN(pos2.lat)) {
        const errMsg = 'The query parameters "lon1", ..., "lat2" are not in a valid format.';
        throw new ParseError(errMsg);
    }

    return [pos1, pos2];
}

async function executeGreenMoRequest(params: string): Promise<Array<Car>> {
    const protocol = 'https';
    const hostname = 'greenmobility.frontend.fleetbird.eu';
    const endpoint = 'api/prod/v1.06/map/cars';

    const url = `${protocol}://${hostname}/${endpoint}/?${params}`;

    console.log(`Execute HTTP request against: ${url}`);
    const response: Response = await fetch(url);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        const msg = `Invalid response code - GreenMo. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    const result: Array<Car> = (await response.json()) as Array<Car>;

    // TODO: change this to parameter, probably a header
    return result.filter((car: Car) => car.fuelLevel <= 100);
}

async function generateMapsParameters(centerPos: Position, positions: Array<Position>): Promise<string> {
    const arr: string[] = [];

    arr.push('style=maptiler-3d');
    arr.push('width=600');
    arr.push('height=600');
    arr.push(`center=lonlat:${centerPos.lon},${centerPos.lat}`);
    arr.push('zoom=14');
    
    const marks = positions.map(pos => `lonlat:${pos.lon},${pos.lat};color:%233ea635;size:medium`);
    arr.push(`marker=${marks.join('|')}`);
    
    arr.push(`apiKey=${await getParameter('mapsApiToken')}`);

    return arr.join('&');
}

async function executeMapsRequest(centerPos: Position, positions: Array<Position>): Promise<ArrayBuffer> {
    const protocol = 'https';
    const hostname = 'maps.geoapify.com';
    const endpoint = 'v1/staticmap';
    const params = await generateMapsParameters(centerPos, positions);

    const url = `${protocol}://${hostname}/${endpoint}?${params}`;

    console.log(`Execute HTTP request against: ${url}`);
    const response: Response = await fetch(url);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        const msg = `Invalid response code - Maps. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    return response.arrayBuffer();
}

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(event);
    console.log(context);


    let pos1, pos2: Position;
    try {
        [pos1, pos2] = getPossitions(event.queryStringParameters);
    } catch (error) {
        console.log(error);
        if (error instanceof ParseError) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: error.message,
                }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'unknown exception',
                }),
            };
        }
    }
     
    let resp: string = '';
    
    try {
        const greenMoParams = `lon1=${pos1.lon}&lat1=${pos1.lat}&lon2=${pos2.lon}&lat2=${pos2.lat}`;
        const carPossitions = await executeGreenMoRequest(greenMoParams) as Array<Position>;
        
        if (carPossitions.length) {
            const centerPos = {
                lat: (pos1.lat + pos2.lat) / 2,
                lon: (pos1.lon + pos2.lat) / 2,
            }
            const img = await executeMapsRequest(centerPos, carPossitions);

            // API gateway behaves like a proxy, the image has to be base64 encoded string with appropriate
            // headers and apigw translates it to blob.
            resp = Buffer.from(img).toString('base64');
        }
    } catch (error) {
        console.log(error);
        if (error instanceof NetworkingError) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    message: error.message,
                }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'unknown exception',
                }),
            };
        }
    }

    console.log('Success');
    return {
        statusCode: 200,
        headers: resp ? { 'Content-Type': 'image/png'} : undefined,
        body: resp ? resp: 'No cars were found.',
        isBase64Encoded: resp ? true : false,
    }
};