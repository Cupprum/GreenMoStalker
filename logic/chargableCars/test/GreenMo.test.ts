import { GreenMo } from '../lib/query/GreenMo';
import axios from 'axios';
jest.mock('axios');

test('the location of chargable cars is fetched', async () => {
    const car1 = {
        carId: 1,
        lat: 1.123456,
        lon: 2.123456,
        fuelLevel: 30,
    };
    const car2 = {
        carId: 2,
        lat: 3.123456,
        lon: 4.123456,
        fuelLevel: 50,
    };
    const data = [car1, car2];

    (axios.get as jest.Mock).mockImplementation(() =>
        Promise.resolve({ status: 200, data: data })
    );

    const pos1 = { lat: 1.123456, lon: 2.123456 };
    const pos2 = { lat: 3.123456, lon: 4.123456 };
    const params = {
        lon1: `${pos1.lon}`,
        lat1: `${pos1.lat}`,
        lon2: `${pos2.lon}`,
        lat2: `${pos2.lat}`,
    };
    const greenMo = new GreenMo(40);
    const cars = await greenMo.query(params);
    expect(cars).toEqual([car1]);
});
