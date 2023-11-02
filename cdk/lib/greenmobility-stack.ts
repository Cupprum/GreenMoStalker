import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
var cp = require('child_process');

function packageLambdaCode(path: string): lambda.AssetCode {
    return lambda.Code.fromAsset(path, {
        bundling: {
            image: lambda.Runtime.NODEJS_18_X.bundlingImage,
            command: [],
            local: {
                tryBundle(outputDir: string) {
                    cp.execSync(
                        `
                            cd ${path}
                            npm install
                            npx esbuild lib/*.ts \
                                --bundle \
                                --minify \
                                --sourcemap \
                                --platform=node \
                                --target=es2020 \
                                --outfile=${outputDir}/index.js
                        `,
                        { stdio: 'inherit' }
                    );
                    return true;
                },
            },
        },
    });
}

export class GreenMobility extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const greenmoApi = new GreenMoApi(this);

        const chargableCarsLambda = this.chargableCarsLambda();

        greenmoApi.addLambda(chargableCarsLambda, 'GET', 'cars');
    }

    private chargableCarsLambda(): lambda.Function {
        // Package the code.
        const codePath = path.join(
            __dirname,
            '..',
            '..',
            'logic',
            'chargableCars'
        );
        const code = packageLambdaCode(codePath);

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
            })
        );

        // Allow invocation from apigateway.
        func.addPermission('ApiGatewayInvokePermission', {
            principal: new cdk.aws_iam.ServicePrincipal(
                'apigateway.amazonaws.com'
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

class GreenMoApi extends apigw.RestApi {
    constructor(scope: Construct) {
        // I do not controll Accept header. Therefore i use */* in binaryMediaTypes.
        // https://docs.aws.amazon.com/apigateway/latest/developerguide/lambda-proxy-binary-media.html
        super(scope, 'greenMoApi', {
            restApiName: 'greenmoApi',
            apiKeySourceType: apigw.ApiKeySourceType.HEADER,
            binaryMediaTypes: ['*/*'],
        });

        const usagePlan = this.addUsagePlan('usagePlan');

        // Hide the lambda functions behind apiKey.
        // Currently useful because i don't want to go over google maps free tier.
        const apiKey = this.addApiKey('apiKey', {
            value: process.env.GREENMO_API_KEY ?? '',
        });

        // Usage plan enforces the use of apiKey.
        usagePlan.addApiKey(apiKey);
        // Usage plan has to be bound to a specific stage in order to work.
        usagePlan.addApiStage({ stage: this.deploymentStage });
    }

    // Wrapper function to add lambda to apigateway path.
    public addLambda(func: lambda.Function, method: string, path: string) {
        const integration = new apigw.LambdaIntegration(func);

        const route = this.root.addResource(path);
        route.addMethod(method, integration, { apiKeyRequired: true });
    }
}
