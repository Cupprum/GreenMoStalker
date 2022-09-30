import fetch, { Response } from 'node-fetch';


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

function generateGreenMoParameters(area: Area) {
    const pos1: string = `lon1=${area.pos1.lon}&lat1=${area.pos1.lat}`;
    const pos2: string = `lon2=${area.pos2.lon}&lat2=${area.pos2.lat}`;
    
    return `${pos1}&${pos2}`;
}

async function executeGreenMoRequest(area: Area) {
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

function generateMapsParameters(positions: Array<Position>) {
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


async function executeMapsRequest(positions: Array<Position>) {
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

function generatePushoverBody(msg: string, img?: Blob) {
    let formdata = new FormData();

    formdata.append("token", process.env.PUSHOVER_API_TOKEN ?? "");
    formdata.append("user", process.env.PUSHOVER_API_USER ?? "");
    formdata.append("message", msg);

    if (img) {
        formdata.append("attachment", img, "image.png");
    }

    return formdata;
}

async function executePushoverRequest(img: Blob) {
    const protocol: string = "https";
    const url: string = "api.pushover.net";
    const endpoint: string = "1/messages.json";
    const body: FormData = generatePushoverBody("Found some cars for charging.", img);

    const fqdn: string = `${protocol}://${url}/${endpoint}`;

    let requestOptions = {
      method: 'POST',
      body: body
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
    const body: FormData = generatePushoverBody(msg);

    const fqdn: string = `${protocol}://${url}/${endpoint}`;

    let requestOptions = {
      method: 'POST',
      body: body
    };
    
    await fetch(fqdn, requestOptions);
}

function getPositions() {
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

async function handler(location: string) {
    // TODO: improve exception handling
    const positions: Map<string, Area> = getPositions();

    const carPossitions: Array<Position> = await executeGreenMoRequest(positions.get(location)) as Array<Position>;
    if (carPossitions.length) {
        const img: Blob = await executeMapsRequest(carPossitions);

        await executePushoverRequest(img);
    }
}

handler("DTU");
