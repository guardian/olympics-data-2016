import reqwest from 'reqwest'

const baseDataUrl = 'https://interactive.guim.co.uk/olympics-2016';
const baseStatsUrl = 'http://localhost:3000';

export default {
    data (url, noBody=true) {
        return reqwest({
            'url': `${baseDataUrl}/${url}.json`,
            'method': noBody ? 'HEAD' : 'GET',
            'type': 'json',
            'crossOrigin': true
        });
    },

    stats(url) {
        return reqwest({
            url: `${baseStatsUrl}/${url}.json`,
            type: 'json',
            crossOrigin: true
        });
    }
};
