# Olympics 2016 data

The basic server commands:

```
npm run fetch -- --no-uat
```

<b>NOTE:</b> `--no-uat` tells the fetcher use the live PA data feed

```
npm run server
```

## Debugging problems

Fetch the latest data
```
cd data
rsync -avzhe ssh ubuntu@54.152.97.91:olympics-data-2016/data/data-in .
```

Run locally against new data
```
npm run fetch -- --test --no-uat
```

Find problem!

## Updating the EC2 instance
```
screen -x

ctrl-a + 2
git pull
```

Any changes to `interactive/src/**` will automatically trigger a rerender. You should never
have to restart the interactive renderer.

Any changes to `data/**` will need to restart the data fetcher
```
ctrl-a + 0
ctrl-c
npm run fetch -- --no-uat
```

## Creating an EC2 instance

NOTE: Everything is in `us-east-1`

You will probably never need to do this

### Install NodeJS, git and AWS CLI

```
wget https://nodejs.org/dist/v4.4.7/node-v4.4.7-linux-x64.tar.xz
tar xvf node-v4.4.7-linux-x64.tar.xz
sudo ln -s ~/node-v4.4.7-linux-x64/bin/node /usr/bin/node
sudo ln -s ~/node-v4.4.7-linux-x64/bin/npm /usr/bin/npm
sudo apt-get install git awscli
```

### Authenticate with AWS
```
aws configure --profile visuals
```
Region is us-east-1
Use your AWS credentials for access key/secret token

### Authenticate with git

https://developer.github.com/guides/managing-deploy-keys/#deploy-keys

### Install olympics-data-2016

Get a copy of `config.json` (available here: https://zerobin.gutools.co.uk/?a07a114114d3bef2#DTNqhOvJ9sf1P9pdwZhn1ynPRFdM7CIZ14qJZ97cgrs=)

```
git clone git@github.com:guardian/olympics-data-2016.git

cd olympics-data-2016

screen

cd data
mv <path to config.json> config.json
npm install

ctrl-a + c
cd interactive
npm install

ctrl-a + c

ctrl-a + 0
npm run fetch -- --no-uat

ctrl-a + 1
npm run server
```

If you follow these instructions:
- ctrl-a + 0 will be the PA data fetcher
- ctrl-a + 1 will be the interactive renderer
- ctrl-a + 2 will be a bash terminal


## Developing

### About

Ingests the Press Association Olympics API v2 and outputs aggregations to S3 for interactives to consume.

There are two caching levels:

1. Each aggregation controls how often it should be refreshed (`cacheTime` in `src/aggregators.js`)
2. PA endpoints are configured in `src/pa.js`

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
- Copy `config.example.json` to `config.json` and fill in the values

### Run

```
npm run fetch -- [opts] [aggregator, ...]
```

Options:
- `--no-pa`: always use PA cache
- `--no-s3`: don't upload to S3
- `--no-loop`: run each aggregator only once
- `--no-notify`: don't notify on error
- `--test`: set all of the above
- `--no-uat`: run against the live PA API

`[aggregator, ...]`: run specific aggregators (not all)

### Files
- `fetch.js`: Entry point, processes the aggregators
- `www.js`: Web API for querying state of aggregators
- `config.json`: Configuration settings, you must set these
- `src/aggregators.js`: List of aggregators
- `src/queue.js`: Queue which runs all aggregations on given event loop.
- `src/pa.js`: PA data (and handles caching PA endpoints)
- `src/s3.js`: Push data to S3
- `src/notify.js`: Send notifications via SNS
