import { PositionQuery, Position } from './PositionQuery';

interface Car extends Position {
    carId: number;
    fuelLevel: number;
}

export class GreenMo extends PositionQuery<Car> {
    protocol = 'https';
    hostname = 'greenmobility.frontend.fleetbird.eu';
    endpoint = 'api/prod/v1.06/map/cars';
    desiredFuelLevel: number;

    constructor(desiredFuelLevel: number) {
        super();
        this.desiredFuelLevel = desiredFuelLevel;
    }

    protected filter(objs: Car[]): Car[] {
        return objs.filter(
            (car: Car) => car.fuelLevel <= this.desiredFuelLevel
        );
    }

    protected map(objs: Car[]): Position[] {
        return objs as Position[];
    }
}
