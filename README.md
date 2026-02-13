# Greenmobility Stalker

[![GreenMo Stalker deployment](https://github.com/Cupprum/GreenMoStalker/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/Cupprum/GreenMoStalker/actions/workflows/deploy.yml)

## Project Description:

This project aims to create an API that serves as a proxy to the functionality provided by [Greenmobility](https://www.greenmobility.com). When a Greenmobility car is placed on a charger while low on battery, users receive free driving minutes. The purpose of this API is to allow for easier automation of fetching information about cars in order to get free minutes.

### Diagram:
![Diagram](diagram/greenmo-diagram.png)

### Parts of project:
The project is deployed on [AWS](https://aws.amazon.com) using the [AWS CDK](https://docs.aws.amazon.com/cdk/api/v2/) for Typescript. The user interacts with an [API Gateway](https://aws.amazon.com/api-gateway/) protected by a [Usage Plan](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html) that requires an API token for authentication. Once authenticated, the API Gateway triggers a [Lambda function](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html). The Lambda function, written in Typescript, determines the location to query, executes the request against the [Greenmobility API](https://greenmobility.frontend.fleetbird.eu/api/prod/v1.06/map/cars), filters the cars that can be charged, finds available chargers in proximity from [Spirii API](https://app.spirii.dk/api/clusters), and generates a static image using the [Geoapify Static Maps API](https://www.geoapify.com/static-maps-api). The image is returned as the response body from the Lambda function. Sensitive information is stored securely in the [SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html). The API is documented using [OpenAPI](https://www.openapis.org/). The project is deployed by executing a [Dagger](https://dagger.io/) pipeline, which is also written in Typescript. The project is automatically deployed with [Github Actions](https://docs.github.com/en/actions).

### Calling the API from Various Devices:

The API Gateway can be accessed from different devices, including iPhones using the [Shortcuts](https://support.apple.com/en-gb/guide/shortcuts/welcome/ios) app. Apple Shortcuts provide powerful automation capabilities, such as detecting when a user is returning home and triggering the query against the API to fetch locations of available cars to charge in the surrounding area. Additionally, Shortcuts allow for creation of simple cronjobs (automatically trigger the request at specific time), that can be configured to only execute the request when the user is in the desired location location.

## Development:

It is recommended to work on this project from a Github Codespaces with a predefined custom Fedora container.

### Configuration:

The project requires the following env vars.

```sh
export GREENMO_AWS_ACCOUNT='xxx'  # AWS account into which the project is deployed.
export GREENMO_AWS_REGION='xxx'  # Preferred AWS Region.
export GREENMO_AWS_ACCESS_KEY_ID='xxx'  # MachineAccount credentials used during deployment.
export GREENMO_AWS_SECRET_ACCESS_KEY='xxx'  # MachineAccount credentials used during deployment.
export GREENMO_OPEN_MAPS_API_TOKEN='xxx'  # Token used to authenticate against [Geoapify](https://www.geoapify.com).
export GREENMO_API_KEY='xxx'  # Authentication key used against the API Gateway.
```

### Logic:

The logic is located in `logic/chargableCars`.

**Installation**:
```sh
cd logic/chargableCars
npm ci # Because npm install overwrites the package-lock.json file.
```

**Execute tests**:
```
npm test
```

**Local development**:
The entrypoint for the code is located in `logic/chargableCars/lib/index.ts`. The commented code at the bottom of the file is used for local development.

### Infra:

The infra is located in the following folder `cdk`.

**Installation**:
```sh
cd cdk
npm ci # Because npm install overwrites the package-lock.json file.
```

**Execute tests**:
```
npm test
```

### Deployment pipeline:

[Dagger](https://dagger.io) is used for the deployment purposes. By default the pipeline is executed from github actions, but it can also be executed locally and triggered manually. The pipeline is located in `ci`.

**Installation**:
```sh
cd ci
npm ci # Because npm install overwrites the package-lock.json file.
```

**Execute**:
```sh
npm run dagger
```

### OpenAPI 3 Documentation:
The openapi.json specification of the project can be updated from the state of currently deployed API Gateway. Command `aws apigateway get-export --parameters extensions='integrations' --rest-api-id 'xxxxxx' --stage-name 'prod' --export-type 'oas30' 'new-openapi.json' --region 'eu-central-1'"` can be used to fetch the current configuration. However it contain also some definitions about APIGateway integration, which are not that interesting to me. The api supports CORS for `https://editor.swagger.io/` origin, so the api can be tested from the official documentation from the [Browser](https://editor.swagger.io/).

### Version 1:

The first iteration of this project utilizes a cronjob running on [GCP](https://console.cloud.google.com) and is deployed using [Terraform](https://www.terraform.io). A [Cloud Scheduler](https://cloud.google.com/scheduler/) triggeres a [Cloud Function](https://cloud.google.com/functions) (version 2) which queries the Greenmobility API for cars at a specific location. The function filteres the cars with low battery and generates a map using the [Google Static Maps API](https://developers.google.com/maps/documentation/maps-static/overview). The map displays locations where cars could be charged for free minutes. The generated image is then send to the [Pushover](https://pushover.net) application and displayed on my phone. Sensitive information, such as tokens, are stored securely in [Secret Manager](https://cloud.google.com/secret-manager).

### Reasoning:

Several factors influenced my decision to make certain changes in the project:

1. Moving away from GCP: I chose to shift away from GCP due to concerns regarding their billing practices and the lack of transparency in understanding the charges associated with specific resources. Additionally, GCP lacks a comparable tool to AWS CDK, which I found preferable for handling deployments. The AWS CDK's ability to write infrastructure using a programming language allows for faster iterations and, in my opinion, improves code readability, especially on shorter projects.

2. Transition from Terraform to AWS CDK: I made the decision to switch from Terraform to AWS CDK because I find writing infrastructure in a programming language more intuitive, especially on smaller projects. This change allows for faster iterations and simplifies the development process.

3. Choice of storing secrets: Instead of utilizing [Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) to store secrets, I opted for using [SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html). This decision was driven by cost considerations, as SSM Parameter Store is less expensive than Secrets Manager. Additionally, since the secrets I'm dealing with don't require the extra protection provided by Secrets Manager, I found Parameter Store to be a suitable and more cost-effective alternative.

4. Switching to Geoapify Static Maps API: I transitioned from using Google Maps Static API to Geoapify Static Maps API due to the requirements imposed by Google. The Google API necessitates attaching a credit card to the account, while Geoapify offers a free tier without the need for credit card details. Moreover, I appreciate that Geoapify utilizes the [OpenStreetMap](https://www.openstreetmap.org/) infrastructure, which adds to its appeal.

