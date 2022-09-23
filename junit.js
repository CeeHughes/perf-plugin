'use strict';

const builder = require('junit-report-builder'),
  urlParser = require('url'),
  log = require('intel').getLogger('sitespeedio.plugin.pipeline'),
  path = require('path'),
  merge = require('lodash.merge');

exports.writeJunit = function (results, dir, options) {
  const urls = Object.keys(merge({}, results.failing, results.working));

  for (const url of urls) {
    let name = url;
    if (url.startsWith('http')) {
      const parsedUrl = urlParser.parse(url);
      name = url.startsWith('http') ? url : url;
      parsedUrl.hostname.replace(/\./g, '_') +
        '.' +
        parsedUrl.path.replace(/\./g, '_').replace(/\//g, '_');
    }

    const suite = builder
      .testSuite()
      .name(
        options.budget.friendlyName
          ? options.budget.friendlyName
          : name
      );

    if (results.failing[url]) {
      for (const result of results.failing[url]) {
        suite
          .testCase()
          .className(name)
          .name(result.metric)
          .time(result.friendlyValue)
          .failure(
            result.metric + ': ' + result.friendlyValue ||
              result.value +
                ' (max ' +
                result.limitType +
                ' ' +
                result.friendlyLimit + ')'
          );
      }
    }

    if (results.working[url]) {
      for (const result of results.working[url]) {
        suite
          .testCase()
          .className(name)
          .name(result.metric)
          .time(result.friendlyValue)
          .standardOutput(
            result.metric + ': ' + result.friendlyValue
          );
      }
    }
  }
  const file = path.join(dir, 'junit.xml');
  log.info('Write pipeline junit to %s', path.resolve(file));
  builder.writeTo(file);
};