'use strict';

const get = require('lodash.get');
const merge = require('lodash.merge');
const log = require('intel').getLogger('sitespeedio.plugin.pipeline');
const friendlyNames = require('./friendlynames');
const time = require('./time');

function getItem(friendlyName, type, metric, value, limit, limitType) {
  return {
    metric: friendlyName.name,
    type,
    value,
    friendlyValue: friendlyName.format(value),
    limit,
    friendlyLimit: friendlyName.format(limit),
    limitType,
    status: 'working'
  };
}

module.exports = {
  verify(message, result, budgets, alias) {
    let budgetSetupSpecificForThisURL;
    if (alias) {
      budgetSetupSpecificForThisURL = get(budgets.budget, alias);
    }
    if (!budgetSetupSpecificForThisURL) {
      budgetSetupSpecificForThisURL = get(budgets.budget, message.url);
    }
    const budgetForThisURL = {};
    merge(budgetForThisURL, budgets.budget, budgetSetupSpecificForThisURL);
    const failing = [];
    const working = [];
    const url = message.url;
    log.verbose('Applying budget to url %s', url);
    const tool = message.type.split('.')[0];
    // Go through all metrics that are configured
    // timing, request, coach etc
    for (let metricType of Object.keys(budgetForThisURL)) {
      for (let metric of Object.keys(budgetForThisURL[metricType])) {
        if (friendlyNames[tool][metricType]) {
          if (!friendlyNames[tool][metricType][metric]) {
            log.error(
              `It seems like you configure a metric ${metric} that we do not have a friendly name. Please check the docs if it is right.`
            );
          }
          const fullPath = friendlyNames[tool][metricType][metric].path;
          let value = get(message.data, fullPath);
          if (value && message.type === 'lighthouse.pageSummary') {
            value = value * 100; // The score in Lighthouse is 0-1
          } else if (
            value &&
            message.type === 'pagexray.pageSummary' &&
            metricType === 'httpErrors'
          ) {
            // count number of http server error
            value = Object.keys(value).filter(code => code > 399).length;
          }
          // We got a matching metric
          if (value !== undefined) {
            const budgetValue = budgetForThisURL[metricType][metric];
            const item = getItem(
              friendlyNames[tool][metricType][metric],
              metricType,
              metric,
              value,
              budgetValue,
              tool === 'coach' || tool === 'lighthouse' || tool === 'gpsi'
                ? 'min'
                : 'max'
            );
            if (tool === 'coach' || tool === 'lighthouse' || tool === 'gpsi') {
              if (value < budgetValue) {
                item.status = 'failing';
                failing.push(item);
              } else {
                working.push(item);
              }
            } else {
              if (value > budgetValue) {
                item.status = 'failing';
                failing.push(item);
              } else {
                working.push(item);
              }
            }
          } else {
            log.debug('Missing data for budget metric ' + metric);
          }
        } else {
          if (metricType === 'usertimings' && tool === 'browsertime') {
            const budgetValue = budgetForThisURL[metricType][metric];
            let value =
              get(
                message.data,
                'statistics.timings.userTimings.marks.' + metric + '.median'
              ) ||
              get(
                message.data,
                'statistics.timings.userTimings.measures.' + metric + '.median'
              );
            if (value) {
              const item = getItem(
                { name: metric, format: time.ms },
                metricType,
                metric,
                value,
                budgetValue,
                'max'
              );
              if (value > budgetValue) {
                item.status = 'failing';
                failing.push(item);
              } else {
                working.push(item);
              }
              continue;
            } else {
              log.error(`Could not find the user timing ${metric}`);
              continue;
            }
          } else if (
            metricType === 'scriptingmetrics' &&
            tool === 'browsertime'
          ) {
            const budgetValue = budgetForThisURL[metricType][metric];
            const value = get(
              message.data,
              'statistics.extras.' + metric + '.median'
            );
            if (value) {
              const item = getItem(
                { name: metric, format: time.ms },
                metricType,
                metric,
                value,
                budgetValue,
                'max'
              );
              if (value > budgetValue) {
                item.status = 'failing';
                failing.push(item);
              } else {
                working.push(item);
              }
              continue;
            } else {
              log.error(`Could not find the scripting metric ${metric}`);
              continue;
            }
          }
        }
      }
    }
    // group working/failing per URL
    if (failing.length > 0) {
      result.failing[alias || message.url] = result.failing[
        alias || message.url
      ]
        ? result.failing[alias || message.url].concat(failing)
        : failing;
    }

    if (working.length > 0) {
      result.working[alias || message.url] = result.working[
        alias || message.url
      ]
        ? result.working[alias || message.url].concat(working)
        : working;
    }
  }
};