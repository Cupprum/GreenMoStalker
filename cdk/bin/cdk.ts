#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GreenMobility } from '../lib/greenmobility-stack'

const app = new cdk.App();
new GreenMobility(app, 'GreenMobility', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});