'use strict';
var fs = require('fs');
var https = require('https');

class ServerlessPrivateAWSRegions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.sdk = this.serverless.providers.aws.sdk;
    this.options = options || {};

    this.commands = {
      region_setup: {
        usage: 'Sets up Serverless Framework to work in private AWS regions',
        lifecycleEvents: ['setup']
      }
    };

    this.hooks = {
      'region_setup:setup': this.setup.bind(this),
      'before:aws:common:validate:validate': this.prepRegion.bind(this),
      'before:deploy:deploy': this.prepRegion.bind(this),
      'before:remove:remove': this.prepRegion.bind(this),
      'before:deploy:function:initialize': this.prepRegion.bind(this),
      'before:invoke:invoke': this.prepRegion.bind(this),
      'before:info:info': this.prepRegion.bind(this),
      'before:rollback:initialize': this.prepRegion.bind(this),
      'before:logs:logs': this.prepRegion.bind(this),
      'after:aws:package:finalize:mergeCustomProviderResources': this.updatePrincipals.bind(
        this
      )
    };
  }

  pluginLog(message) {
    this.serverless.cli.log(`serverless-private-aws-regions - ${message}`);
  }
  getCustomS3Endpoint() {
    if (
      this.serverless.service.custom &&
      this.serverless.service.custom.customRegion &&
      this.serverless.service.custom.customRegion.s3Endpoint
    ) {
      return this.serverless.service.custom.customRegion.s3Endpoint;
    } else {
      return false;
    }
  }
  getCustomPrincipals() {
    if (
      this.serverless.service.custom &&
      this.serverless.service.custom.customRegion &&
      this.serverless.service.custom.customRegion.servicePrincipals
    ) {
      return this.serverless.service.custom.customRegion.servicePrincipals;
    } else {
      return false;
    }
  }
  // @TODO figure out if there is a way to get this from aws nodejs sdk
  getCustomEndpoint() {
    if (
      this.serverless.service.custom &&
      this.serverless.service.custom.customRegion &&
      this.serverless.service.custom.customRegion.endpoint
    ) {
      return this.serverless.service.custom.customRegion.endpoint;
    } else {
      return false;
    }
  }
  configureAwsSdk() {
    this.pluginLog(`Updating AWS Nodejs SDK`);
    const bundle = process.env.AWS_CA_BUNDLE;
    if (bundle) {
    } else {
      throw new this.serverless.classes.Error(
        'Make sure to define the AWS_CA_BUNDLE environment variable'
      );
    }
    const certs = [fs.readFileSync(bundle)];
    this.sdk.config.region = this.serverless.service.provider.region;
    this.sdk.config.signatureVersion = 'v4';
    var endpoint = this.getCustomEndpoint();
    if (endpoint) {
      this.sdk.config.endpoint = endpoint;
    }
    this.sdk.config.httpOptions = {
      agent: new https.Agent({
        rejectUnauthorized: true,
        ca: certs
      })
    };
  }

  updatePrincipals() {
    var custom_principals = this.getCustomPrincipals();
    if (!custom_principals) {
      return;
    }
    const template_resources = this.serverless.service.provider
      .compiledCloudFormationTemplate.Resources;
    Object.keys(template_resources).forEach(resource => {
      if (template_resources[resource].Type == 'AWS::Lambda::Permission') {
        // now check principal
        var principal = template_resources[resource].Properties.Principal;
        if (typeof principal == 'string') {
          service = principal.split('.')[0];

          var new_principal = custom_principals.find(
            x => x.service === service
          );

          if (new_principal) {
            new_principal = new_principal.principal;
            this.pluginLog(
              `Changing Principal from ${principal} to ${new_principal}`
            );
            principal = new_principal;
          }
        } else if ('Fn::Join' in principal) {
          // using the join intrinsic function to piece together the principal
          var join_principal = principal['Fn::Join'][1][0];
          var service = join_principal.replace(/\.+$/, '');
          var new_principal = custom_principals.find(
            x => x.service === service
          );

          if (new_principal) {
            new_principal = new_principal.principal;
            this.pluginLog(
              `Changing Principal from ${principal} to ${new_principal}`
            );
            principal = new_principal;
          }
        } else {
          console.log('something else');
          console.log(typeof principal);
        }
        template_resources[resource].Properties.Principal = principal;
      }
    });
  }
  alterS3EndpointFunction() {
    const s3_custom = this.getCustomS3Endpoint();
    if (!s3_custom) {
      return;
    }
    if (!s3_custom['pattern'] || !s3_custom['return']) {
      throw new this.serverless.classes.Error(
        'For custom regions, define both a `pattern` and `return` value for the S3Endpoint'
      );
    }
    var linesToAdd = [];
    if (s3_custom['comment']) {
      linesToAdd.push(`// ${s3_custom['comment']}`);
    }
    const custom_endpoint_line = `if (strRegion.match(/${
      s3_custom['pattern']
    }/)) return \`${s3_custom['return']}\`;`.replace(/\\/g, '');

    linesToAdd.push(custom_endpoint_line);
    const filePath = `${this.serverless.config.serverlessPath}/plugins/aws/utils/getS3EndpointForRegion.js`;
    this.addLinesToFile(
      filePath,
      'const strRegion = region.toLowerCase();',
      linesToAdd,
      2
    );
  }

  addLinesToFile(filePath, findLine, appendedLines, prepending_spaces = 0) {
    this.pluginLog(`Adding \n${appendedLines.join('\n')}\n\nto ${filePath}`);
    this.restoreOrig(filePath);
    this.backupOrig(filePath);
    var file_text = fs
      .readFileSync(filePath)
      .toString()
      .split('\n');
    const trimmed = file_text.map(s => s.trim());
    var appendedLines = appendedLines.map(s => {
      return `${' '.repeat(prepending_spaces)}${s}`;
    });
    const line_no = trimmed.indexOf(findLine);
    if (line_no < 0) {
      throw new this.serverless.classes.Error(
        `Can't find ${findLine} in ${filePath}`
      );
    } else {
      file_text.splice(line_no + 1, 0, ...appendedLines);
      fs.writeFileSync(filePath, file_text.join('\n'), err => {
        if (err) throw err;
        this.pluginLog(`Updated ${filePath}`);
      });
    }
  }

  backupOrig(filePath) {
    if (!fs.existsSync(`${filePath}.orig`)) {
      fs.copyFileSync(filePath, `${filePath}.orig`);
    }
  }

  restoreOrig(filePath) {
    if (fs.existsSync(`${filePath}.orig`)) {
      fs.renameSync(`${filePath}.orig`, filePath);
    }
  }

  setup() {
    this.pluginLog('Running setup for private region');
    this.alterS3EndpointFunction();
    this.configureAwsSdk();
  }

  prepRegion() {
    this.configureAwsSdk();
  }
}

module.exports = ServerlessPrivateAWSRegions;
