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

// TODO: make lat and lon extend position, this is a bit dangerous
interface Car {
    carId: number;
    lat: number;
    lon: number;
    fuelLevel: number;
}

interface Charger {
    properties: {
        id: string;
        numOfAvailableConnectors: number;
    };
    geometry: {
        coordinates: [number, number];
    };
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
    parameters: string,
    desiredFuelLevel: number
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

    return result.filter((car: Car) => car.fuelLevel <= desiredFuelLevel);
}

export async function executeSpiriiRequest(
    parameters: string
): Promise<Position[]> {
    const protocol = 'https';
    const hostname = 'app.spirii.dk';
    const endpoint = 'api/clusters';

    const url = `${protocol}://${hostname}/${endpoint}/?${parameters}`;

    console.log(`Execute HTTP request against: ${url}.`);
    const response = await axios.get(url, {
        headers: {
            appversion: '3.6.1',
        },
    });

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        const msg = `Invalid response code - Spirii. Got ${response.status}, expected ${expectedStatusCode}`;
        throw new NetworkingError(msg);
    }

    const result = response.data as Charger[];
    const filtered = result.filter((charger: Charger) => {
        console.log(charger.properties.numOfAvailableConnectors);
        console.log(charger.properties.numOfAvailableConnectors > 0);
        return charger.properties.numOfAvailableConnectors > 0;
    });

    return filtered.map((charger) => {
        return {
            lat: charger.geometry.coordinates[1],
            lon: charger.geometry.coordinates[0],
        };
    });
}

async function generateMapsParameters(
    centerPosition: Position,
    positions: {
        carPositions: Position[];
        chargerPositions: Position[];
    }
): Promise<string> {
    const arr: string[] = [];

    arr.push('style=maptiler-3d');
    arr.push('width=600');
    arr.push('height=600');
    arr.push(`center=lonlat:${centerPosition.lon},${centerPosition.lat}`);
    arr.push('zoom=14');

    let pins: string[] = [];
    pins.push(
        ...positions.carPositions.map(
            // The color is in hex format, the %23 is for hashtag...
            (pos) => `lonlat:${pos.lon},${pos.lat};color:%233ea635;size:medium`
        )
    );
    pins.push(
        ...positions.chargerPositions.map(
            // The color is in hex format, the %23 is for hashtag...
            (pos) => `lonlat:${pos.lon},${pos.lat};color:%23f30e0e;size:medium`
        )
    );
    arr.push(`marker=${pins.join('|')}`);

    arr.push(`apiKey=${await getParameter('/greenmo/mapsApiToken')}`);
    return arr.join('&');
}

export async function executeMapsRequest(
    centerPos: Position,
    positions: {
        carPositions: Position[];
        chargerPositions: Position[];
    }
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

    console.log(`Event: ${JSON.stringify(event)}`);
    console.log(`Context: ${JSON.stringify(context)}`);

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
        // TODO: is there a way to change this into a dictonary?
        const greenMoParams = `lon1=${pos1.lon}&lat1=${pos1.lat}&lon2=${pos2.lon}&lat2=${pos2.lat}`;
        // TODO: verify this in a better way, the unkown is not supposed to be there
        const desiredFuelLevel = parameters[
            'desiredFuelLevel'
        ] as unknown as number;
        carPositions = await executeGreenMoRequest(
            greenMoParams,
            desiredFuelLevel ? desiredFuelLevel : 40
        );
    } catch (error) {
        console.error('Failed fetching cars for charging.');
        console.log(error);
        if (error instanceof NetworkingError) {
            return errResponse(403, error.message);
        } else {
            return errResponse(500, 'unknown exception');
        }
    }

    // TODO: execute concurently with getting positions of cars.
    console.log('Fetch chargers in desired location.');
    let chargerPositions: Position[];
    try {
        // TODO: is there a way to turn this into a dictionary?
        // Zoom of 22, so that on map, it shows detailed chargers and not just clusters.
        // %2C is a separator between the latitude and longitude.
        const spiriiParams = `zoom=22&boundsNe=${pos1.lat}%2C${pos2.lon}&boundsSw=${pos2.lat}%2C${pos1.lon}`;
        chargerPositions = await executeSpiriiRequest(spiriiParams);
    } catch (error) {
        console.error('Failed fetching charger locations.');
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

        resp = { statusCode: 200, body: msg };
    } else {
        console.log('Cars for charging were found.');

        console.log('Generate map of chargable cars.');
        const centerPos = calculateCenter(pos1, pos2);
        let img: ArrayBuffer;
        try {
            img = await executeMapsRequest(centerPos, {
                carPositions,
                chargerPositions,
            });
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
