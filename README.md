# Olympics 2016 data

Ingests the Press Association Olympics API v2 and outputs aggregations to S3 for interactives to consume.

There are two caching levels:

1. Each aggregation controls how often it should be refreshed (`cacheTime` in `src/aggregators.js`)
2. PA endpoints are currently all cached for 30 seconds (`CACHE_TIME` in `src/pa.js`)

### Aggregators

Aggregators define which PA endpoints they need to consume and a transformation function to process the data.

```
{
    'id': 'example',
    paDeps': [
        'olympics/2012-summer-olympics/medal-table',
        'olympics/2012-summer-olympics/schedule'
    ],
    'transform': (medals, schedule) => {
        return {medals, schedule};
    },
    'cacheTime': moment.duration(2, 'hours')
}
```

### Install

- `npm install`
- Copy `config.example.js` to `config.js` and fill in the values

### Run 

`babel-node index.js`

### Files
- `index.js`: Entry point, processes the aggregators
- `config.js`: Configuration settings, you must set these
- `src/aggregators.js`: List of aggregators
- `src/queue.js`: Queue which runs all aggregations on given event loop.
- `src/pa.js`: PA data (and handles caching PA endpoints)
- `src/s3.js`: Push data to S3
