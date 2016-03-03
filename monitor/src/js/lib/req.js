import reqwest from 'reqwest'

const baseUrl = 'https://interactive.guim.co.uk/olympics-2016';

export default function req(url, method='GET') {
    return reqwest({
        url: `${baseUrl}/${url}.json`,
        method,
        type: 'json',
        crossOrigin: true
    });
}
