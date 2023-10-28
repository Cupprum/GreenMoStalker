import {
    parsePositions,
    executeMapsRequest,
    transformImage,
    handler,
} from '../lib/index';
import { GreenMo } from '../lib/query/GreenMo';
import { Spirii } from '../lib/query/Spirii';

import axios from 'axios';
import { getParameter } from '@aws-lambda-powertools/parameters/ssm';

jest.mock('../lib/query/GreenMo');
jest.mock('../lib/query/Spirii');
jest.mock('axios');
jest.mock('@aws-lambda-powertools/parameters/ssm');

test('the position is parsed from request', () => {
    const [pos1, pos2] = parsePositions({
        lat1: '1.123456',
        lon1: '2.123456',
        lat2: '3.123456',
        lon2: '4.123456',
    });

    expect(pos1).toStrictEqual({ lat: 1.123456, lon: 2.123456 });
    expect(pos2).toStrictEqual({ lat: 3.123456, lon: 4.123456 });
});

test('the image containg a map is generated', async () => {
    const centerPos = { lat: 1.123456, lon: 1.123456 };
    const carPositions = [
        { lat: 1.123456, lon: 2.123456 },
        { lat: 3.123456, lon: 4.123456 },
    ];
    const chargerPositions = [{ lat: 1.123456, lon: 2.123456 }];

    const mockOutput = Buffer.from([0xff, 0xff, 0xff]);

    (getParameter as jest.Mock).mockImplementation(() =>
        Promise.resolve('xxx')
    );

    (axios.get as jest.Mock).mockImplementation(() =>
        Promise.resolve({ status: 200, data: mockOutput })
    );

    await executeMapsRequest(centerPos, {
        carPositions,
        chargerPositions,
    }).then((data) => expect(data).toBe(mockOutput));
});

test('the image is transformed', () => {
    const input = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00,
    ]);

    const transformedImage = transformImage(input);

    expect(transformedImage).toBe('/9j/4AAQSkZJRgABAQAA');
});

test('parameters were not specified', async () => {
    // @ts-expect-error
    const resp = await handler({}, {});
    expect(resp.statusCode).toBe(400);
    expect(resp.body).toBe(
        JSON.stringify({ message: 'The query string parameters are missing.' })
    );
});

test('parameters were specified incorrectly', async () => {
    const event = {
        queryStringParameters: {},
    };

    // @ts-expect-error
    const resp = await handler(event, {});
    expect(resp.statusCode).toBe(400);
    expect(resp.body).toBe(
        JSON.stringify({ message: 'The positions are not in a valid format.' })
    );
});

test('greenmo didnt find any cars', async () => {
    const event = {
        queryStringParameters: {
            lon1: '1.123456',
            lat1: '2.123456',
            lon2: '3.123456',
            lat2: '4.123456',
        },
    };

    jest.spyOn(GreenMo.prototype, 'query').mockImplementation(async () => []);

    // @ts-expect-error
    const resp = await handler(event, {});
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBe('No cars for charging were found.');
});

test('spirii didnt find any available chargers', async () => {
    const event = {
        queryStringParameters: {
            lon1: '1.123456',
            lat1: '2.123456',
            lon2: '3.123456',
            lat2: '4.123456',
            chargers: 'true',
        },
    };

    jest.spyOn(GreenMo.prototype, 'query').mockImplementation(async () => [
        { lat: 1.123, lon: 1.123 },
    ]);
    jest.spyOn(Spirii.prototype, 'query').mockImplementation(async () => []);

    // @ts-expect-error
    const resp = await handler(event, {});
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBe('No available chargers were found.');
});

test('cars and chargers were found', async () => {
    const event = {
        queryStringParameters: {
            lon1: '1.123456',
            lat1: '2.123456',
            lon2: '3.123456',
            lat2: '4.123456',
            chargers: 'true',
        },
    };

    (axios.get as jest.Mock).mockImplementation(() =>
        Promise.resolve({ status: 200, data: Buffer.from([]) })
    );

    jest.spyOn(GreenMo.prototype, 'query').mockImplementation(async () => [
        { lat: 1.123, lon: 1.123 },
    ]);
    jest.spyOn(Spirii.prototype, 'query').mockImplementation(async () => [
        { lat: 1.123, lon: 1.123 },
    ]);

    // @ts-expect-error
    const resp = await handler(event, {});
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBeDefined();
});
