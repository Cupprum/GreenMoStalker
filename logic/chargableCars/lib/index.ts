import { getParameter } from '@aws-lambda-powertools/parameters/ssm';
import {
    type APIGatewayEvent,
    type APIGatewayProxyEventQueryStringParameters,
    type APIGatewayProxyResult,
    type Context,
} from 'aws-lambda';
import axios from 'axios';

import { Position, NetworkingError } from './query/PositionQuery';
import { GreenMo } from './query/GreenMo';
import { Spirii } from './query/Spirii';

type Params = {
    queryCars: boolean;
    queryChargers: boolean;
    desiredFuelLevel: number;
};

class ParseError extends Error {}

export function parsePositions(
    parameters: APIGatewayProxyEventQueryStringParameters,
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

async function generateMapsParameters(
    centerPosition: Position,
    positions: {
        carPositions: Position[];
        chargerPositions: Position[];
    },
): Promise<string> {
    const arr: string[] = [];

    arr.push('style=maptiler-3d');
    arr.push('width=600');
    arr.push('height=600');
    arr.push(`center=lonlat:${centerPosition.lon},${centerPosition.lat}`);
    arr.push('zoom=14');

    let pins: string[] = [];
    // TODO: change this, this should maybe be iterative?
    pins.push(
        ...positions.carPositions.map(
            // The color is in hex format, the %23 is for hashtag...
            (pos) => `lonlat:${pos.lon},${pos.lat};color:%233ea635;size:medium`,
        ),
    );
    pins.push(
        ...positions.chargerPositions.map(
            // The color is in hex format, the %23 is for hashtag...
            (pos) => `lonlat:${pos.lon},${pos.lat};color:%23f30e0e;size:medium`,
        ),
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
    },
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

function messageResponse(statusCode: number, message: string) {
    console.log('The lambda function execution failed.');
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://editor.swagger.io',
        },
        body: JSON.stringify({
            message: message,
        }),
    };
}

export const handler = async (
    event: APIGatewayEvent,
    context: Context,
): Promise<APIGatewayProxyResult> => {
    console.log('The lambda function execution start.');

    console.log(`Event: ${JSON.stringify(event)}`);
    console.log(`Context: ${JSON.stringify(context)}`);

    console.log('Parse possitions from query string parameters.');
    const parameters = event.queryStringParameters;
    if (!parameters) {
        const errMsg = 'The query string parameters are missing.';
        console.error(errMsg);
        return messageResponse(400, errMsg);
    }

    let pos1, pos2: Position;
    try {
        [pos1, pos2] = parsePositions(parameters);
    } catch (error) {
        console.error('Parsing positions failed.');
        console.error(error);
        if (error instanceof ParseError) {
            return messageResponse(400, error.message);
        } else {
            return messageResponse(500, 'unknown exception');
        }
    }
    console.log('Positions successfully parsed.');

    console.log('Parse rest of the parameters.');
    const params: Params = {
        queryCars: (parameters['cars'] as string) == 'true',
        queryChargers: (parameters['chargers'] as string) == 'true',
        desiredFuelLevel: parameters['desiredFuelLevel']
            ? parseInt(parameters['desiredFuelLevel'])
            : 40,
    };
    console.log(`params: ${params}`);
    console.log('Parameters parsed.');

    let carPositionsPromise: Promise<Position[]> | undefined;
    if (params.queryCars) {
        console.log('Fetch cars in desired location.');
        try {
            const greenMoParams = {
                lon1: `${pos1.lon}`,
                lat1: `${pos1.lat}`,
                lon2: `${pos2.lon}`,
                lat2: `${pos2.lat}`,
            };
            const greenMo = new GreenMo(params.desiredFuelLevel);
            carPositionsPromise = greenMo.query(greenMoParams);
        } catch (error) {
            console.error('Failed fetching cars for charging.');
            console.log(error);
            if (error instanceof NetworkingError) {
                return messageResponse(403, error.message);
            } else {
                return messageResponse(500, 'unknown exception');
            }
        }
    }

    let chargerPositionsPromise: Promise<Position[]> | undefined;
    if (params.queryChargers) {
        console.log('Fetch chargers in desired location.');
        try {
            // Zoom of 22, so that on map, it shows detailed chargers and not just clusters.
            const spiriiParams = {
                zoom: '22',
                boundsNe: `${pos1.lat},${pos2.lon}`,
                boundsSw: `${pos2.lat},${pos1.lon}`,
            };
            const spirii = new Spirii();
            chargerPositionsPromise = spirii.query(spiriiParams);
        } catch (error) {
            console.error('Failed fetching charger locations.');
            console.log(error);
            if (error instanceof NetworkingError) {
                return messageResponse(403, error.message);
            } else {
                return messageResponse(500, 'unknown exception');
            }
        }
    }

    // The GreenMo and Spirii requests are executed asynchronously.
    let carPositions: Position[] | undefined;
    let chargerPositions: Position[] | undefined;

    if (params.queryCars && carPositionsPromise) {
        carPositions = (await Promise.all([carPositionsPromise])).at(0);
    }
    if (params.queryChargers && chargerPositionsPromise) {
        chargerPositions = (await Promise.all([chargerPositionsPromise])).at(0);
    }

    let resp: APIGatewayProxyResult;

    if (
        (carPositions || []).length == 0 &&
        (chargerPositions || []).length == 0
    ) {
        let msg = 'No available cars and chargers were found.';
        resp = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://editor.swagger.io',
            },
            body: JSON.stringify({ message: msg }),
        };
    } else {
        if (params.queryCars) {
            console.log(
                `Amount of found cars: ${(chargerPositions || []).length}.`,
            );
        }
        if (params.queryChargers) {
            console.log(
                `Amount of found chargers: ${(chargerPositions || []).length}.`,
            );
        }

        console.log('Generate map.');
        const centerPos = calculateCenter(pos1, pos2);
        let img: ArrayBuffer;
        try {
            img = await executeMapsRequest(centerPos, {
                carPositions: carPositions || [],
                chargerPositions: chargerPositions || [],
            });
        } catch (error) {
            console.error('Generating map failed.');
            console.log(error);
            if (error instanceof NetworkingError) {
                return messageResponse(403, error.message);
            } else {
                return messageResponse(500, 'unknown exception');
            }
        }
        console.log('Map generated successfully.');

        const transformedImage = transformImage(img);

        resp = {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Access-Control-Allow-Origin': 'https://editor.swagger.io',
            },
            body: transformedImage,
            isBase64Encoded: true,
        };
    }

    console.log('The lambda function finished successfully.');
    return resp;
};

// // Used for local development.
// const event = {
//     queryStringParameters: {
//         lon1: "12.511368",
//         lat1: "55.794430",
//         lon2: "12.527933",
//         lat2: "55.779566"
//     }
// }

// // @ts-expect-error
// handler(event, {});
