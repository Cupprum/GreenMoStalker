import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigw } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class GreenMobility extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const chargableCarsLambda = this.chargableCarsLambda();

        // The 'Accept' header in the request should be -> Accept: image/png, application/json
        // https://docs.aws.amazon.com/apigateway/latest/developerguide/lambda-proxy-binary-media.html
        const api = new apigw.RestApi(this, 'GreenMoApi', {
            apiKeySourceType: apigw.ApiKeySourceType.HEADER,
            binaryMediaTypes: ['image/png'],
            defaultMethodOptions: {
                apiKeyRequired: true,
            },
            deployOptions: {
                loggingLevel: apigw.MethodLoggingLevel.INFO,
            },
        });

        const mapModel = api.addModel('MapModel', {
            contentType: 'image/png',
            schema: {},
        });

        const messageModel = api.addModel('MessageModel', {
            schema: {
                type: apigw.JsonSchemaType.OBJECT,
                properties: {
                    message: {
                        type: apigw.JsonSchemaType.STRING,
                    },
                },
                required: ['message'],
            },
        });

        const generateMessageResponse = (statusCode: string) => {
            return {
                statusCode: statusCode,
                responseParameters: {
                    'method.response.header.Content-Type': true,
                    'method.response.header.Access-Control-Allow-Origin': true,
                },
                responseModels: {
                    'application/json': messageModel,
                },
            };
        };

        const carsEndpoint = api.root.addResource('cars');
        carsEndpoint.addMethod(
            'GET',
            new apigw.LambdaIntegration(chargableCarsLambda),
            {
                requestParameters: {
                    'method.request.querystring.lat1': true,
                    'method.request.querystring.lon1': true,
                    'method.request.querystring.lat2': true,
                    'method.request.querystring.lon2': true,
                    'method.request.querystring.chargers': false,
                },
                methodResponses: [
                    {
                        statusCode: '200',
                        responseParameters: {
                            'method.response.header.Content-Type': true,
                            'method.response.header.Access-Control-Allow-Origin': true,
                        },
                        responseModels: {
                            'image/png': mapModel,
                            'application/json': messageModel,
                        },
                    },
                    generateMessageResponse('400'),
                    generateMessageResponse('403'),
                    generateMessageResponse('500'),
                ],
            },
        );

        // Enable CORS support for the endpoint.
        carsEndpoint.addCorsPreflight({
            allowOrigins: ['https://editor.swagger.io'],
            allowMethods: ['GET'],
        });

        const usagePlan = api.addUsagePlan('usagePlan');

        // Hide the lambda functions behind apiKey.
        // Currently useful because i don't want to go over free tier.
        const apiKey = api.addApiKey('apiKey', {
            value: process.env.GREENMO_API_KEY ?? '',
        });

        // Usage plan enforces the use of apiKey.
        usagePlan.addApiKey(apiKey);
        // Usage plan has to be bound to a specific stage in order to work.
        usagePlan.addApiStage({ stage: api.deploymentStage });
    }

    private chargableCarsLambda(): lambda.Function {
        // Package the code.
        const codePath = path.join(
            __dirname,
            '..',
            '..',
            'logic',
            'chargableCars',
            'dist',
        );
        const code = lambda.Code.fromAsset(codePath);

        const func = new lambda.Function(this, 'chargableCarsLambda', {
            functionName: 'chargableCarsLambda',
            code: code,
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(15),
        });

        // Allow accessing specific SSM Parameters.
        func.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['ssm:GetParameter'],
                resources: [
                    `arn:aws:ssm:${this.region}:${this.account}:parameter/greenmo/*`,
                ],
            }),
        );

        // Allow invocation from apigateway.
        func.addPermission('ApiGatewayInvokePermission', {
            principal: new cdk.aws_iam.ServicePrincipal(
                'apigateway.amazonaws.com',
            ),
            action: 'lambda:InvokeFunction',
        });

        // Define required parameters.
        new ssm.StringParameter(this, 'mapsApiToken', {
            parameterName: '/greenmo/mapsApiToken',
            stringValue: process.env.OPEN_MAPS_API_TOKEN ?? '',
        });

        return func;
    }
}
