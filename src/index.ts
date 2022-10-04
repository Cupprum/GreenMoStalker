import fetch, { Response } from 'node-fetch';
import { FormData } from "formdata-node"
import { FormDataEncoder } from 'form-data-encoder';
import { Readable } from 'stream';
import * as functions from '@google-cloud/functions-framework';


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

function generateGreenMoParameters(area: Area): string {
    const pos1: string = `lon1=${area.pos1.lon}&lat1=${area.pos1.lat}`;
    const pos2: string = `lon2=${area.pos2.lon}&lat2=${area.pos2.lat}`;
    
    return `${pos1}&${pos2}`;
}

async function executeGreenMoRequest(area: Area): Promise<Array<Car>> {
    const protocol: string = "https";
    const url: string = "greenmobility.frontend.fleetbird.eu";
    const endpoint: string = "api/prod/v1.06/map/cars";
    const params: string = generateGreenMoParameters(area);

    const fqdn: string = `${protocol}://${url}/${endpoint}/?${params}`;

    const response: Response = await fetch(fqdn);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        await exceptionPushoverRequest("Greenmo query failed");
        throw Error(`Invalid response code. Got ${response.status}, expected ${expectedStatusCode}`);
    }

    const result: Array<Car> = (await response.json()) as Array<Car>;

    return result.filter(
        function(car: Car, _) {
            return car.fuelLevel < 30;
        }
    );
}

function generateMapsParameters(positions: Array<Position>): string {
    const centerPos: Position = {
        lat: 55.787867,
        lon: 12.521667
    };
    const center: string = `center=${centerPos.lat},${centerPos.lon}`;
    
    const size: string = "size=500x400";
    
    const key: string = `key=${process.env.GOOGLE_MAPS_API_TOKEN ?? ''}`;
    const zoom: string = "zoom=14";
    const maptype: string = "maptype=satellite";

    const markers: string = positions.map((pos) => {
        return `markers=color:green%7Clabel:G%7C${pos.lat},${pos.lon}`;
    }).join("&");

    return `${center}&${size}&${key}&${zoom}&${maptype}&${markers}`;
}


async function executeMapsRequest(positions: Array<Position>): Promise<Blob> {
    const protocol: string = "https";
    const url: string = "maps.googleapis.com";
    const endpoint: string = "maps/api/staticmap";
    const params: string = generateMapsParameters(positions);

    const fqdn: string = `${protocol}://${url}/${endpoint}?${params}`;

    const response: Response = await fetch(fqdn);

    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        await exceptionPushoverRequest("Maps query failed");
        throw Error(`Invalid response code. Got ${response.status}, expected ${expectedStatusCode}`);
    }

    return response.blob();
}

function generatePushoverBody(msg: string, img?: Blob): FormDataEncoder {
    let formdata = new FormData();

    formdata.append("token", process.env.PUSHOVER_API_TOKEN ?? "");
    formdata.append("user", process.env.PUSHOVER_API_USER ?? "");
    formdata.append("message", msg);

    if (img) {
        formdata.append("attachment", img, "image.png");
    }

    return new FormDataEncoder(formdata);
}

async function executePushoverRequest(img: Blob) {
    const protocol: string = "https";
    const url: string = "api.pushover.net";
    const endpoint: string = "1/messages.json";
    const encoder: FormDataEncoder = generatePushoverBody("Found some cars for charging.", img);

    const fqdn: string = `${protocol}://${url}/${endpoint}`;

    let requestOptions = {
      method: 'POST',
      headers: encoder.headers,
      body: Readable.from(encoder)
    };
    
    const response: Response = await fetch(fqdn, requestOptions);
    const expectedStatusCode = 200;
    if (response.status != expectedStatusCode) {
        await exceptionPushoverRequest("Pushover notification failed");
        throw Error(`Invalid response code. Got ${response.status}, expected ${expectedStatusCode}`);
    }
}

async function exceptionPushoverRequest(msg: string) {
    const protocol: string = "https";
    const url: string = "api.pushover.net";
    const endpoint: string = "1/messages.json";
    const encoder: FormDataEncoder = generatePushoverBody(msg);
    
    const fqdn: string = `${protocol}://${url}/${endpoint}`;

    let requestOptions = {
      method: 'POST',
      headers: encoder.headers,
      body: Readable.from(encoder)
    };
    
    await fetch(fqdn, requestOptions);
}

function getPositions(): Map<string, Area> {
    let positions = new Map<string, Area>();

    positions.set("DTU", {
        pos1: {
            lat: 55.794430,
            lon: 12.511368
        },
        pos2: {
            lat: 55.779566,
            lon: 12.527933
        }
    });  

    return positions;
}

functions.http('GreenMoNotifier', async (req, res) => {
    const location: string = "DTU"; // TODO: get it from cloudEvent, Access the CloudEvent data payload via cloudEvent.data
    const positions: Map<string, Area> = getPositions();

    const carPossitions: Array<Position> = await executeGreenMoRequest(positions.get(location)) as Array<Position>;
    if (carPossitions.length) {
        const img: Blob = await executeMapsRequest(carPossitions);

        await executePushoverRequest(img);
    }
    res.send('Success');
});