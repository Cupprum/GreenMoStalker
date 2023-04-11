import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';
import { SecretValue } from 'aws-cdk-lib';
import { ParameterTier } from 'aws-cdk-lib/aws-ssm';
var cp = require('child_process');

export class GreenMobility extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const greenmoApi = new GreenmoApi(this);
		
		const chargableCarsLambda = this.chargableCarsLambda();

		greenmoApi.addRoute(chargableCarsLambda.functionArn, 'GET', '/cars');

		new cdk.CfnOutput(this, 'ApiArn', {
			exportName: 'api-url',
			value: greenmoApi.attrApiEndpoint,
		});
	}

	private packageLambdaCode(path: string): lambda.AssetCode {
		return lambda.Code.fromAsset(path, {
			bundling: {
				image: lambda.Runtime.NODEJS_18_X.bundlingImage,
				command: [],

				local: {
					tryBundle(outputDir: string) {
						cp.execSync(
							`
								tsc --target es6 --moduleResolution node --outDir ${outputDir} ${path}/index.ts
								cp ${path}/package.json ${outputDir}
								cp ${path}/package-lock.json ${outputDir}
								cd ${outputDir}
								npm install
							`,
							{ stdio: 'inherit' }
						);
						return true;
					},
				},
			}
		});
	}

	private chargableCarsLambda(): lambda.Function {
		// Package the code
		const codePath = path.join(__dirname, '..', 'lambda', 'chargableCars');
		const code = this.packageLambdaCode(codePath);

		const func = new lambda.Function(this, 'chargableCarsLambda', {
			functionName: 'chargableCarsLambda',
			code: code,
			handler: 'index.handler',
			runtime: lambda.Runtime.NODEJS_18_X,
			timeout: cdk.Duration.seconds(15),
		});

		// Allow accessing specific SSM Parameters
		func.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ['ssm:GetParameter'],
				resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/greenmo/*`],
			})
		);

		// Allow invocation from apigateway
		func.addPermission('ApiGatewayInvokePermission', {
			principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
			action: 'lambda:InvokeFunction',
		});

		// Define required parameters
		new ssm.StringParameter(this, 'mapsApiToken', {
			parameterName: '/greenmo/mapsApiToken',
			stringValue: process.env.GOOGLE_MAPS_API_TOKEN ?? '',
		});
		new ssm.StringParameter(this, 'pushoverApiToken', {
			parameterName: '/greenmo/pushoverApiToken',
			stringValue: process.env.PUSHOVER_API_TOKEN ?? '',
		});
		new ssm.StringParameter(this, 'pushoverApiUser', {
			parameterName: '/greenmo/pushoverApiUser',
			stringValue: process.env.PUSHOVER_API_USER ?? '',
		});

		return func;
	}
}

class GreenmoApi extends apigw.CfnApi {
	constructor(scope: Construct) {
		super(scope,'greenmoApi', {
			name: 'greenmoApi',
			protocolType: 'HTTP',
		});

		// Default stage in AWS is called $default.
		// Default setting is manual deployment.
		new apigw.CfnStage(scope, 'greenmoApiDefaultStage', {
			apiId: this.ref,
			stageName: '$default',
			autoDeploy: true,
		});
	}

	// Wrapper function to  create integrations easier.
	public addRoute(functionArn: string, method: string, route: string) {
		const integration new apigw.CfnIntegration(this, 'integration', {
			apiId: this.ref,
			integrationType: 'AWS_PROXY',
			integrationUri: functionArn,
			payloadFormatVersion: '2.0',
		});

		new apigw.CfnRoute(this, 'MyRoute', {
			apiId: this.ref,
			routeKey: `${method} ${route}`,
			target: `integrations/${integration.ref}`,
		});
	}
}