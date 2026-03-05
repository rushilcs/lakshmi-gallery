#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { LakshmiGalleryStack } from "../lib/stack";

const app = new cdk.App();

const appName = app.node.tryGetContext("appName") ?? "lakshmi-gallery";

new LakshmiGalleryStack(app, `${appName}-stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  appName,
});

app.synth();
