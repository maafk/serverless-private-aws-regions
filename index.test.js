'use strict';
const Plugin = require('.');
const Serverless = require('serverless/lib/Serverless');
const AwsProvider = require('serverless/lib/plugins/aws/provider/awsProvider');

describe('Using the serverless private aws regions plugin', () => {
  describe('Verify AWS NodeJS SDK set properly, and basic functions', () => {
    let plugin;
    let serverless;
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
      delete process.env.NODE_ENV;
      process.env.AWS_CA_BUNDLE = '/usr/local/etc/openssl/cert.pem';

      serverless = new Serverless();
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.cli = {
        log: () => {},
        consoleLog: () => {}
      };
      serverless.service = {
        provider: {
          region: 'mars-east-1'
        },
        custom: {
          customRegion: {
            s3Endpoint: {
              pattern: 'mars-space',
              return: 's3.${strRegion}.amazonmars.space',
              comment:
                'look for amazon mars - currently s3.amazon-mars-1.amazonmars.space'
            },
            endpoint: '{service}.{region}.amazonmars.space',
            servicePrincipals: [
              {
                service: 'logs',
                principal: 'logs.${self:provider.region}.amazonmars.space'
              }
            ]
          }
        }
      };

      plugin = new Plugin(serverless);
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    test('Nodejs SDK should get set according to config', () => {
      plugin.configureAwsSdk();
      expect(plugin.sdk.config.signatureVersion).toBe('v4');
      expect(plugin.sdk.config.endpoint).toBe(
        plugin.serverless.service.custom.customRegion.endpoint
      );
    });

    test('Error thrown if AWS_CA_BUNDLE is not set', () => {
      delete process.env.AWS_CA_BUNDLE;
      expect(() => {
        plugin.configureAwsSdk();
      }).toThrow(/Make sure to define the AWS_CA_BUNDLE environment variable/);
    });

    test('getCustomS3Endpoint works', () => {
      const expected = {
        pattern: 'mars-space',
        return: 's3.${strRegion}.amazonmars.space',
        comment:
          'look for amazon mars - currently s3.amazon-mars-1.amazonmars.space'
      };
      expect(plugin.getCustomS3Endpoint()).toEqual(expected);
    });

    test('getCustomS3Endpoint returns false if properties not provided', () => {
      delete serverless.service.custom.customRegion.s3Endpoint;
      expect(plugin.getCustomS3Endpoint()).toBeFalsy();
    });

    test('getCustomPrincipals works', () => {
      const expected = [
        {
          service: 'logs',
          principal: 'logs.${self:provider.region}.amazonmars.space'
        }
      ];
      expect(plugin.getCustomPrincipals()).toEqual(expected);
    });

    test('getCustomPrincipals returns false if properties not provided', () => {
      delete serverless.service.custom.customRegion;
      expect(plugin.getCustomPrincipals()).toBeFalsy();
    });

    test('getCustomEndpoint works', () => {
      const expected = '{service}.{region}.amazonmars.space';
      expect(plugin.getCustomEndpoint()).toEqual(expected);
    });

    test('getCustomEndpoint returns false if properties not provided', () => {
      delete serverless.service.custom;
      expect(plugin.getCustomEndpoint()).toBeFalsy();
    });
  });

  describe('Replacing service Principals', () => {
    let plugin;
    let serverless;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.cli = {
        log: () => {},
        consoleLog: () => {}
      };
      serverless.service.provider.compiledCloudFormationTemplate = {};
      serverless.service.custom = {
        customRegion: {
          servicePrincipals: []
        }
      };
    });

    test('Replace service principal when originaly string', () => {
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          SomePermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Principal: 'logs.amazonaws.com'
            }
          }
        }
      };
      serverless.service.custom.customRegion.servicePrincipals = [
        {
          service: 'logs',
          principal: 'logs.${self:provider.region}.amazonmars.space'
        }
      ];
      plugin = new Plugin(serverless);
      plugin.updatePrincipals();
      var props =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SomePermission.Properties.Principal;
      expect(props).toBe('logs.${self:provider.region}.amazonmars.space');
    });

    test('Replace service principal when part of a join', () => {
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          SomePermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Principal: {
                'Fn::Join': [
                  '',
                  ['logs.', { Ref: 'AWS::Region' }, '.amazonaws.com']
                ]
              }
            }
          }
        }
      };
      serverless.service.custom.customRegion.servicePrincipals = [
        {
          service: 'logs',
          principal: 'logs.${self:provider.region}.amazonmars.space'
        }
      ];
      plugin = new Plugin(serverless);
      plugin.updatePrincipals();
      var props =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SomePermission.Properties.Principal;
      expect(props).toBe('logs.${self:provider.region}.amazonmars.space');
    });

    test('Only replace service princiapls set in the config', () => {
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          SomePermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Principal: 'logs.amazonaws.com'
            }
          },
          SomeOtherPermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Principal: 'events.amazonaws.com'
            }
          }
        }
      };
      serverless.service.custom.customRegion.servicePrincipals = [
        {
          service: 'logs',
          principal: 'logs.${self:provider.region}.amazonmars.space'
        }
      ];
      plugin = new Plugin(serverless);
      plugin.updatePrincipals();
      var props =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SomePermission.Properties.Principal;
      var otherProps =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SomeOtherPermission.Properties.Principal;
      expect(props).toBe('logs.${self:provider.region}.amazonmars.space');
      expect(otherProps).toBe('events.amazonaws.com');
    });
  });
  describe('Alter S3 endpoint function', () => {
    let serverless;
    let plugin;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.cli = {
        log: () => {},
        consoleLog: () => {}
      };
      serverless.service.custom = {
        customRegion: {
          s3Endpoint: {
            pattern: 'mars-space',
            return: 's3.${strRegion}.amazonmars.space',
            comment:
              'look for amazon mars - currently s3.amazon-mars-1.amazonmars.space'
          }
        }
      };
      serverless.config.serverlessPath = '.';
      plugin = new Plugin(serverless);
    });

    test('alterS3EndpointFunction updates the file', () => {});
  });
});
