import iframeMessenger from 'guardian/iframe-messenger'
import doT from 'olado/doT'
import moment from 'moment'
import req from './lib/req'

import embedHTML from './text/embed.html!text'
import aggregatorHTML from './text/aggregator.html!text'

const lastModifiedFormat =  'ddd, DD, MMM YYYY HH:mm:ss';

console.log(filesize);

var templateFn = doT.template(embedHTML);
var aggregatorTemplateFn = doT.template(aggregatorHTML);

function app(el, aggregators) {
    el.innerHTML = templateFn({aggregators});

    var aggregatorsEl = el.querySelector('.js-aggregators');

    aggregators.forEach(aggregator => {
        var r = req(aggregator.id, 'HEAD').then(resp => {
            var xhr = r.request;
            var lastModified = moment(xhr.getResponseHeader('Last-Modified'), lastModifiedFormat);

            var stats = {
                'lastModified': lastModified.fromNow() + ' (' + lastModified.format() + ')'
            };

            if (moment().diff(lastModified) > aggregator.cacheTime || true) {
                stats.error = {'type': 'stale'};
            }
            return stats;

        }).catch(xhr => {
            return {
                'lastModified': 'unknown',
                'error': {
                    'type': 'http',
                    'status': xhr.statusCode
                }
            };
        }).then(stats => {
            aggregatorsEl.innerHTML += aggregatorTemplateFn({aggregator, stats});
        });
    });

    //setTimeout(() => app(el, aggregators), 30 * 1000);
}

window.init = function init(el, config) {
    iframeMessenger.enableAutoResize();
    req('_aggregators').then(resp => app(el, resp));
};
