import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
var cp = require('child_process');

export class GreenMobility extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const chargableCarsName = 'chargableCars'
		const chargableCarsCodePath = path.join(__dirname, '..', 'lambda', chargableCarsName);
		const chargableCarsCode = this.packageLambdaCode(chargableCarsCodePath);

		const chargableCarsLambda = new lambda.Function(this, `${chargableCarsName}Lambda`, {
			functionName: `${chargableCarsName}Lambda`,
			code: chargableCarsCode,
			handler: 'index.handler',
			runtime: lambda.Runtime.NODEJS_18_X,
			timeout: cdk.Duration.seconds(15),
		});

		chargableCarsLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ['ssm:GetParameter'],
				resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/greenmo/*`],
			})
		);

		const mapsApiToken = new ssm.StringParameter(this, 'mapsApiToken', {
			parameterName: '/greenmo/mapsApiToken',
			stringValue: process.env.GOOGLE_MAPS_API_TOKEN ?? '',
		});
		const pushoverApiToken = new ssm.StringParameter(this, 'pushoverApiToken', {
			parameterName: '/greenmo/pushoverApiToken',
			stringValue: process.env.PUSHOVER_API_TOKEN ?? '',
		});
		const pushoverApiUser = new ssm.StringParameter(this, 'pushoverApiUser', {
			parameterName: '/greenmo/pushoverApiUser',
			stringValue: process.env.PUSHOVER_API_USER ?? '',
		});

		// const chargableCarsCronJobLundto = new events.Rule(this, `${chargableCarsName}CronJobLundto`, {
		// 	ruleName: `${chargableCarsName}CronJobLundto`,
		// 	schedule: events.Schedule.cron({}),
		// });
		// chargableCarsCronJobLundto.addTarget(new targets.LambdaFunction(chargableCarsLambda));
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
}
