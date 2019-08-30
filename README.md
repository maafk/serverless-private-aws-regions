# serverless-private-aws-regions

Let's imagine that aliens got AWS to build them a region in mars for them to train their mind control algorithms. Since they've got deep pockets and don't want anyone else poking around, it's a private region just for them.

They still want to use the [serverless framework](https://serverless.com/framework/) but their endpoints are different, sometimes their service principals are weird, and the [partition](https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html) is not publicly known.

Let's make a plugin to help!

## Get set up

This made up region for the aliens is called `mars-east-1`. Put this under the `provider` section in the `serverless.yml`, otherwise serverless framework will default to `us-east-1`

```yml
provider:
  name: aws
  region: mars-east-1
```

### Add this plugin to `serverless.yml`

```yml
plugins:
  - serverless-private-aws-regions
```

### Add `customRegion` under `custom` section

In the `custom` block of your `serverless.yml`, add the following

```yml
custom:
  customRegion:
```

There are customizations that can be done here.

### Custom endpoint

```yml
custom:
  customRegion:
    endpoint: "{service}.{region}.amazonmars.space"
```

The aliens want to make sure they're reaching out to the correct region in mars.

This will set the [endpoint](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Endpoint.html) property on the aws nodejs sdk which it will use when connecting to the private region.

### Custom service principals

```yml
custom:
  customRegion:
    servicePrincipals:
      - service: logs
        principal: logs.${self:provider.region}.amazonmars.space
      - service: events
        principal: events.${self:provider.region}.amazonmars.space
```

In situationas where the private region has different service principals for services, you'll set that here.

If a service isn't included, it will default to the stadard principal for commercial AWS (e.g. `logs.amazonaws.com`, `events.amazonaws.com`)

### Custom logic for getting S3 Endpoints

```yml
custom:
  customRegion:
    s3Endpoint:
      comment: look for amazon mars - currently s3.amazon-mars-1.amazonmars.space
      pattern: mars-
      return: s3.$\{strRegion\}.amazonmars.space
```

The code for [getS3EndpointForRegion()](https://github.com/serverless/serverless/blob/master/lib/plugins/aws/utils/getS3EndpointForRegion.js) in serverless isn't very configurable, so we can change it to work for the mars region.

Since the private region is called `mars-east-1`, we look for the pattern `mars-`. We want the [getS3EndpointForRegion()](https://github.com/serverless/serverless/blob/master/lib/plugins/aws/utils/getS3EndpointForRegion.js) function to recongnize that pattern and return the appropriate S3 endpoint.

The `comment` is optional, but be sure to include the `pattern` for the special partition (this this case `mars-`), and what should be returned in the function (`return`).

Note the curly braces are escaped in the sample above. This is to avoid serverless framework from thinking this is a variable.  The back slashes are removed before the [getS3EndpointForRegion()](https://github.com/serverless/serverless/blob/master/lib/plugins/aws/utils/getS3EndpointForRegion.js) function is updated.

## Usage

## Before you deploy

Before attempting to deploy, or whenever you update the serverless framework, run the `region_setup` command

```bash
sls region_setup
```

This will make any necessary updates to the serverless framework that _can't_ be done in the standard serverless plugin lifecycle hooks

## Deploy

Do a normal deploy, and as long as `serverless-private-aws-regions` is listed as a plugin, all should work as expected

## misc

When using/testing this plugin, make sure `AWS_CA_BUNDLE` environment variable is set.

On mac you can use `/usr/local/etc/openssl/cert.pem`

```bash
export AWS_CA_BUNDLE=/usr/local/etc/openssl/cert.pem
```

## Contributing

Just like the aliens in our fictional scenario, please keep details of your private region private.

## Issues

Feel free to log issues, but please keep details of your private region private.
