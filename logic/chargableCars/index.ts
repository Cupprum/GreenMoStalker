import { getParameter } from '@aws-lambda-powertools/parameters/ssm';
import {
    type APIGatewayEvent,
    type APIGatewayProxyEventQueryStringParameters,
    type APIGatewayProxyResult,
    type Context,
} from 'aws-lambda';
import axios from 'axios';

class ParseError extends Error {}
class NetworkingError extends Error {}

interface Car {
    carId: number;
    lat: number;
    lon: number;
    fuelLevel: number;
}

type Position = {
    lat: number;
    lon: number;
};

export function parsePositions(
    parameters: APIGatewayProxyEventQueryStringParameters
): [Position, Position] {
    const lat1 = parseFloat(parameters['lat1'] as string);
    const lon1 = parseFloat(parameters['lon1'] as string);

    if (isNaN(lat1) || isNaN(lon1)) {
        throw new ParseError('The positions are not in a valid format.');
    }

    const pos1: Position = { lat: lat1, lon: lon1 };

    const lat2 = parseFloat(parameters['lat2'] as string);
    const lon2 = parseFloat(parameters['lon2'] as string);

    if (isNaN(lat2) || isNaN(lon2)) {
        throw new ParseError('The positions are not in a valid format.');
    }

    const pos2: Position = { lat: lat2, lon: lon2 };

    return [pos1, pos2];
}

function calculateCenter(topLeft: Position, bottomRight: Position): Position {
    return {
        lat: (topLeft.lat + bottomRight.lat) / 2,
        lon: (topLeft.lon + bottomRight.lon) / 2,
    };
}

export async function executeGreenMoRequest(
    parameters: string
): Promise<Car[]> {
    const protocol = 'https';
    const hostname = 'greenmobility.frontend.fleetbird.eu';
    const endpoint = 'api/prod/v1.06/map/cars';

    const url = `${protocol}://${hostname}/${endpoint}/?${parameters}`;

    console.log(`Execute HTTP request against: ${url}.`);
    const response = await axios.get(url);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        const msg = `Invalid response code - GreenMo. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    const result = response.data as Car[];

    // TODO: change this to parameter, probably a header
    return result.filter((car: Car) => car.fuelLevel <= 40);
}

async function generateMapsParameters(
    centerPosition: Position,
    carPositions: Position[]
): Promise<string> {
    const arr: string[] = [];

    arr.push('style=maptiler-3d');
    arr.push('width=600');
    arr.push('height=600');
    arr.push(`center=lonlat:${centerPosition.lon},${centerPosition.lat}`);
    arr.push('zoom=14');

    const pins = carPositions.map(
        (pos) => `lonlat:${pos.lon},${pos.lat};color:%233ea635;size:medium`
    );
    arr.push(`marker=${pins.join('|')}`);

    arr.push(`apiKey=${await getParameter('/greenmo/mapsApiToken')}`);
    return arr.join('&');
}

export async function executeMapsRequest(
    centerPos: Position,
    positions: Position[]
): Promise<ArrayBuffer> {
    const protocol = 'https';
    const hostname = 'maps.geoapify.com';
    const endpoint = 'v1/staticmap';
    const params = await generateMapsParameters(centerPos, positions);

    const url = `${protocol}://${hostname}/${endpoint}?${params}`;

    console.log(`Execute HTTP request against: ${url}.`);
    const response = await axios.get(url, { responseType: 'arraybuffer' });

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        const msg = `Invalid response code - Maps. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    return response.data as ArrayBuffer;
}

export function transformImage(img: ArrayBuffer): string {
    // API gateway behaves like a proxy, the image has to be base64 encoded string with appropriate
    // headers and apigw afterwards translates it to blob.
    return Buffer.from(img).toString('base64');
}

function errResponse(statusCode: number, message: string) {
    console.log('The lambda function execution failed.');
    return {
        statusCode: statusCode,
        body: JSON.stringify({
            message: message,
        }),
    };
}

export const handler = async (
    event: APIGatewayEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    console.log('The lambda function execution start.');

    console.log(event); // TODO: Verify why i do not have a string here
    console.log(context); // TODO: Verify why i do not have a string here

    console.log('Parse possitions from query string parameters.');
    const parameters = event.queryStringParameters;
    if (!parameters) {
        const errMsg = 'The query string parameters are missing.';
        console.error(errMsg);
        return errResponse(400, errMsg);
    }

    let pos1, pos2: Position;
    try {
        [pos1, pos2] = parsePositions(parameters);
    } catch (error) {
        console.error('Parsing positions failed.');
        console.error(error);
        if (error instanceof ParseError) {
            return errResponse(400, error.message);
        } else {
            return errResponse(500, 'unknown exception');
        }
    }
    console.log('Positions successfully parsed.');

    console.log('Fetch cars in desired location.');
    let carPositions: Position[];
    try {
        const greenMoParams = `lon1=${pos1.lon}&lat1=${pos1.lat}&lon2=${pos2.lon}&lat2=${pos2.lat}`;
        carPositions = await executeGreenMoRequest(greenMoParams);
    } catch (error) {
        console.error('Failed fetching cars for charging.');
        console.log(error);
        if (error instanceof NetworkingError) {
            return errResponse(403, error.message);
        } else {
            return errResponse(500, 'unknown exception');
        }
    }

    let resp: APIGatewayProxyResult;
    if (carPositions.length == 0) {
        const msg = 'No cars for charging were found.';
        console.log(msg);

        // TODO: i dont think the 'no cars were found works'.
        resp = { statusCode: 200, body: msg };
    } else {
        console.log('Cars for charging were found.');

        console.log('Generate map of chargable cars.');
        const centerPos = calculateCenter(pos1, pos2);
        let img: ArrayBuffer;
        try {
            img = await executeMapsRequest(centerPos, carPositions);
        } catch (error) {
            console.error('Generating map failed.');
            console.log(error);
            if (error instanceof NetworkingError) {
                return errResponse(403, error.message);
            } else {
                return errResponse(500, 'unknown exception');
            }
        }
        console.log('Map generated successfully.');

        const transformedImage = transformImage(img);

        resp = {
            statusCode: 200,
            headers: { 'Content-Type': 'image/png' },
            body: transformedImage,
            isBase64Encoded: true,
        };
    }

    console.log('The lambda function finished successfully.');
    return resp;
};

// const event = {
//     queryStringParameters: {
//         lon1: "12.511368",
//         lat1: "55.794430",
//         lon2: "12.527933",
//         lat2: "55.779566"
//     }
// }

// handler(event, {});
