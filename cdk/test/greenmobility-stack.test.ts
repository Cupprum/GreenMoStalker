import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { GreenMobility } from '../lib/greenmobility-stack';

// Get Name or Id of a CloudFormation object.
const getName = (o: {}) => Object.keys(o).at(0);

describe('Given the creation of GreenMobility stack', () => {
    describe('When the stack synthesizes', () => {
        const app = new cdk.App();

        const greenMobilityStack = new GreenMobility(app, 'GreenMobility', {
            env: {
                account: 'xxx',
                region: 'xxx',
            },
        });

        const template = Template.fromStack(greenMobilityStack);

        test('Then a SSM String Parameter should be created', () => {
            template.hasResourceProperties('AWS::SSM::Parameter', {
                Type: 'String',
                Name: '/greenmo/mapsApiToken',
            });
        });

        describe('Then a Lambda Function', () => {
            test('Should be created', () => {
                template.hasResourceProperties('AWS::Lambda::Function', {
                    FunctionName: 'chargableCarsLambda',
                    Runtime: 'nodejs18.x',
                    Timeout: 15,
                });
            });

            test('Should have associated IAM Role with access to read SSM Parameters', () => {
                const roleInLambdaCapture = new Capture();
                const roleInPolicyCapture = new Capture();

                template.hasResourceProperties('AWS::Lambda::Function', {
                    Role: {
                        'Fn::GetAtt': [roleInLambdaCapture, 'Arn'],
                    },
                });

                template.hasResourceProperties('AWS::IAM::Policy', {
                    PolicyDocument: {
                        Statement: Match.arrayWith([
                            {
                                Action: 'ssm:GetParameter',
                                Effect: 'Allow',
                                Resource:
                                    'arn:aws:ssm:xxx:xxx:parameter/greenmo/*',
                            },
                        ]),
                    },
                    Roles: Match.arrayWith([
                        {
                            Ref: roleInPolicyCapture,
                        },
                    ]),
                });

                expect(roleInLambdaCapture.asString()).toBe(
                    roleInPolicyCapture.asString(),
                );
            });

            test('Can be triggered by the  API Gateway', () => {
                template.hasResourceProperties('AWS::Lambda::Permission', {
                    Action: 'lambda:InvokeFunction',
                    Principal: 'apigateway.amazonaws.com',
                });
            });
        });

        describe('Then a API Gateway', () => {
            test('Should be created', () => {
                template.hasResourceProperties('AWS::ApiGateway::RestApi', {
                    Name: 'greenmoApi',
                });
            });

            test('Should be integrated with the Lambda Function', () => {
                const lambda = getName(
                    template.findResources('AWS::Lambda::Function'),
                );

                const lambdaCapture = new Capture();

                template.hasResourceProperties('AWS::ApiGateway::Method', {
                    Integration: {
                        Type: 'AWS_PROXY',
                        Uri: {
                            'Fn::Join': Match.arrayWith([
                                Match.arrayWith([
                                    {
                                        'Fn::GetAtt': [lambdaCapture, 'Arn'],
                                    },
                                ]),
                            ]),
                        },
                    },
                });

                expect(lambdaCapture.asString()).toBe(lambda);
            });

            test('Should have a Usage Plan with API Key', () => {
                const apiId = getName(
                    template.findResources('AWS::ApiGateway::RestApi'),
                );
                const stage = getName(
                    template.findResources('AWS::ApiGateway::Stage'),
                );

                const apiIdCapture = new Capture();
                const stageCapture = new Capture();

                template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
                    ApiStages: Match.arrayWith([
                        Match.objectLike({
                            ApiId: {
                                Ref: apiIdCapture,
                            },
                            Stage: {
                                Ref: stageCapture,
                            },
                        }),
                    ]),
                });

                expect(apiIdCapture.asString()).toBe(apiId);
                expect(stageCapture.asString()).toBe(stage);

                const keyId = getName(
                    template.findResources('AWS::ApiGateway::ApiKey'),
                );
                const usagePlanId = getName(
                    template.findResources('AWS::ApiGateway::UsagePlan'),
                );

                const keyIdCapture = new Capture();
                const usagePlanIdCapture = new Capture();

                template.hasResourceProperties(
                    'AWS::ApiGateway::UsagePlanKey',
                    {
                        KeyId: {
                            Ref: keyIdCapture,
                        },
                        KeyType: 'API_KEY',
                        UsagePlanId: {
                            Ref: usagePlanIdCapture,
                        },
                    },
                );

                expect(keyIdCapture.asString()).toBe(keyId);
                expect(usagePlanIdCapture.asString()).toBe(usagePlanId);
            });

            test('Should support binaryMediaTypes', () => {
                template.hasResourceProperties('AWS::ApiGateway::RestApi', {
                    Name: 'greenmoApi',
                    BinaryMediaTypes: ['*/*'],
                });
            });
        });
    });
});
