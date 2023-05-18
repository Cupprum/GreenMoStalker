import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { FormData } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';
import fetch, { Response } from 'node-fetch';
import { Readable } from 'stream';


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

type Area = {
    pos1: Position;
    pos2: Position;
};

async function getParameter(name: string): Promise<string> {
    try {
        const command = new GetParameterCommand({ Name: `/greenmo/${name}` });
        return (await ssm.send(command)).Parameter?.Value ?? '';
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function parseAreaHeader(area: string | undefined): Area {
    if (area == undefined) {
        const errMsg = 'Missing the "area" header.';
        throw new ParseError(errMsg);
    }

    const positions = area.split(';');
    const pos1 = positions.at(0)?.split(',');
    const pos2 = positions.at(1)?.split(',');

    // TODO: test this
    if (positions.length != 2 || pos1?.length != 2 || pos2?.length != 2) {
        const errMsg = 'The "area" header is in wrong format.';
        throw new ParseError(errMsg);
    }

    const lat1 = parseFloat(pos1.at(0) as string);
    const lon1 = parseFloat(pos1.at(1) as string);
    const lat2 = parseFloat(pos2.at(0) as string);
    const lon2 = parseFloat(pos2.at(1) as string);

    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
        const errMsg = 'The "area" header is not in valid format.';
        throw new ParseError(errMsg);
    }

    return {
        pos1: {
            lat: lat1,
            lon: lon1,
        },
        pos2: {
            lat: lat2,
            lon: lon2,
        }
    }
}

function generateGreenMoParameters(area: Area): string {
    const pos1 = `lon1=${area.pos1.lon}&lat1=${area.pos1.lat}`;
    const pos2 = `lon2=${area.pos2.lon}&lat2=${area.pos2.lat}`;

    return `${pos1}&${pos2}`;
}

async function executeGreenMoRequest(area: Area): Promise<Array<Car>> {
    const protocol = 'https';
    const hostname = 'greenmobility.frontend.fleetbird.eu';
    const endpoint = 'api/prod/v1.06/map/cars';
    const params = generateGreenMoParameters(area);

    const url = `${protocol}://${hostname}/${endpoint}/?${params}`;

    const response: Response = await fetch(url);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        // TODO: output this through the lambda function.
        // await exceptionPushoverRequest('Greenmo query failed');
        const msg = `Invalid response code. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    const result: Array<Car> = (await response.json()) as Array<Car>;

    return result.filter(
        function (car: Car, _) {
            return car.fuelLevel <= 100;
        }
    );
}

async function generateMapsParameters(centerPos: Position, positions: Array<Position>): Promise<string> {
    const center = `center=${centerPos.lat},${centerPos.lon}`;

    const size = 'size=500x400';

    const key = `key=${await getParameter('mapsApiToken')}`;
    const zoom = 'zoom=14';
    const maptype = 'maptype=satellite';

    const markers: string = positions.map((pos) => {
        return `markers=color:green%7Clabel:G%7C${pos.lat},${pos.lon}`;
    }).join('&');

    return `${center}&${size}&${key}&${zoom}&${maptype}&${markers}`;
}


async function executeMapsRequest(centerPos: Position, positions: Array<Position>): Promise<ArrayBuffer> {
    const protocol = 'https';
    const hostname = 'maps.googleapis.com';
    const endpoint = 'maps/api/staticmap';
    const params = await generateMapsParameters(centerPos, positions);

    const url = `${protocol}://${hostname}/${endpoint}?${params}`;

    const response: Response = await fetch(url);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        // TODO: output this through the lambda function.
        // await exceptionPushoverRequest('Maps query failed');
        const msg = `Invalid response code. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    return response.arrayBuffer();
}

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // console.log(event);
    // console.log(context);

    let area: Area;

    try {
        area = parseAreaHeader(event.headers.area);
    } catch (error) {
        if (error instanceof ParseError) {
            console.log(error);
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

    try {
        const carPossitions: Array<Position> = await executeGreenMoRequest(area) as Array<Position>;
        if (carPossitions.length) {
            const centerPos = {
                lat: (area.pos1.lat + area.pos2.lat) / 2,
                lon: (area.pos1.lon + area.pos2.lon) / 2,
            }

            const img = await executeMapsRequest(centerPos, carPossitions);
            const base64Image = Buffer.from(img).toString('base64');

            // TODO: refactor the way i handle the output of the function.
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'image/png'},
                body: base64Image,
                isBase64Encoded: true
            }

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
        body: JSON.stringify({
            message: 'Success',
        }),
    };
};