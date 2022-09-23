'use strict';

const verify = require('./verify').verify;
const junit = require('./junit');
const log = require('intel').getLogger('sitespeedio.plugin.pipeline');

module.exports = {
  name() {
    return path.basename(__dirname);
  },  
  open(context, options) {
    this.options = options;
    this.pipelineOptions = options.pipeline || {};
    this.storageManager = context.storageManager;
    this.result = context.pipeline;
    this.alias = {};
    this.make = context.messageMaker('pipeline').make;
    this.pipelineTypes = [
      'browsertime.pageSummary',
      'webpagetest.pageSummary',
      'pagexray.pageSummary',
      'coach.pageSummary',
      'axe.pageSummary'
    ];
  },
  processMessage(message, queue) {
    if (!this.options.pipeline) {
      return;
    }

    if (message.type === 'browsertime.alias') {
      this.alias[message.url] = message.data;
      return;
    }
    const pipeline = this.options.pipeline.config;

    if (this.pipelineTypes.indexOf(message.type) > -1) {
      verify(message, this.result, pipeline, this.alias[message.url]);
    } else {
      switch (message.type) {
        case 'pipeline.addMessageType': {
          if (!message.data.type) {
            log.error('Received add message for pipeline without message type');
          } else {
            this.pipelineTypes.push(message.data.type);
          }
          break;
        }

        case 'sitespeedio.prepareToRender': {
          let failing = 0;
          let working = 0;
          for (const url of Object.keys(this.result.failing)) {
            for (const result of this.result.failing[url]) {
              log.info(
                'Failure for %s for %s with value %s %s limit %s',
                result.metric,
                url,
                result.friendlyValue || result.value,
                result.limitType,
                result.friendlyLimit || result.limit
              );
              failing = failing + 1;
            }
          }

          queue.postMessage(this.make('pipeline.result', this.result));

          if (this.pipelineOptions.removeWorkingResult) {
            for (const url of Object.keys(this.result.working)) {
              if (!this.result.failing[url]) {
                queue.postMessage(this.make('remove.url', {}, { url }));
              }
            }
          }

          for (const url of Object.keys(this.result.working)) {
            working = working + this.result.working[url].length;
          }
          log.info(
            'Pipeline: %d working, %d failing tests and %d errors',
            working,
            failing,
            Object.keys(this.result.error).length
          );
          break;
        }
        case 'error': {
          if (message.url) {
            this.result.error[message.url] = message.data;
          }
          break;
        }

        case 'sitespeedio.render': {
          if (this.options.pipeline) {
            junit.writeJunit(
              this.result,
              this.storageManager.getBaseDir(),
              this.options
            );
          }
        }
      }
    }
  }
};