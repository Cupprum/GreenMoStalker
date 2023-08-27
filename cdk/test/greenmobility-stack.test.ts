import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { GreenMobility } from '../lib/greenmobility-stack';

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
                template.hasResourceProperties('AWS::IAM::Policy', {
                    PolicyDocument: {
                        Statement: Match.arrayWith([
                            {
                                Action: 'ssm:GetParameter',
                                Effect: 'Allow',
                                Resource: Match.stringLikeRegexp(
                                    '.*:parameter/greenmo/.*',
                                ),
                            },
                        ]),
                    },
                    Roles: Match.arrayWith([
                        {
                            Ref: Match.stringLikeRegexp(
                                '^chargableCarsLambda.*',
                            ),
                        },
                    ]),
                });
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
                template.hasResourceProperties('AWS::ApiGateway::Method', {
                    Integration: {
                        Type: 'AWS_PROXY',
                        Uri: {
                            'Fn::Join': Match.arrayWith([
                                Match.arrayWith([
                                    Match.objectLike({
                                        'Fn::GetAtt': Match.arrayWith([
                                            Match.stringLikeRegexp(
                                                '^chargableCarsLambda.*',
                                            ),
                                        ]),
                                    }),
                                ]),
                            ]),
                        },
                    },
                });
            });

            test('Should have a Usage Plan with API Key', () => {
                template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
                    ApiStages: Match.arrayWith([
                        Match.objectLike({
                            ApiId: {
                                Ref: Match.stringLikeRegexp('^greenMoApi.*'),
                            },
                            Stage: {
                                Ref: Match.stringLikeRegexp('^greenMoApi.*'),
                            },
                        }),
                    ]),
                });

                template.hasResourceProperties(
                    'AWS::ApiGateway::UsagePlanKey',
                    {
                        KeyId: {
                            Ref: Match.stringLikeRegexp('^greenMoApi.*'),
                        },
                        KeyType: 'API_KEY',
                        UsagePlanId: {
                            Ref: Match.stringLikeRegexp('^greenMoApi.*'),
                        },
                    },
                );
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
