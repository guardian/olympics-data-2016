import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import swig from 'swig'
import moment from 'moment'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import log from './src/log'
import { config } from './src/config'

const fsStat = denodeify(fs.stat);
const fsUnlink = denodeify(fs.unlink);

const logger = log('www');

function readdir(d) {
    var g = glob();
    return denodeify(g.readdir.bind(g))(d);
}

function paCacheStats(file) {
    return fsStat(file).then(stat => {
        return {'file': file.replace(config.pa.cacheDir, ''), 'modified': stat.mtime};
    });
}


function run(aggregators) {

    var app = express();

    app.get('/health', (req, res) => {
        let msg = aggregators.map(agg => {
            return [
                agg.id,
                agg.isHealthy() ? 'healthy' : 'unhealthy',
                agg.isProcessing() ? 'processing' : 'not processing',
                'last success was ' + agg.getLastSuccess()
            ].join(', ');
        }).join('<br />');

        if (aggregators.every(agg => agg.isHealthy())) {
            res.send('<h1>HEALTHY</h1><br />' + msg);
        } else {
            res.status(404).send('<h1>UNHEALTHY</h1><br />' + msg);
        }
    });

    app.get('/aggregators.json', cors(), (req, res) => {
        var out = aggregators.map(aggregator => {
            let combiners = aggregator.combiners.map(combiner => combiner.name);
            return {
                'id': aggregator.id,
                'cacheTime': aggregator.cacheTime.asMilliseconds(),
                combiners
            };
        });

        res.send(out);
    });

    app.get('/pa.json', cors(), (req, res) => {
        readdir(config.pa.cacheDir + '/**/*.json').then(files => {
            return Promise.all(files.map(paCacheStats));
        }).then(stats => {
            res.send(stats);
        }).catch(err => {
            res.status(500).send(err);
        });
    });

    app.post('/refresh', (req, res) => {
        var {id, type} = req.query;

        if (type === 'pa') {
            let file = path.normalize(path.join(config.pa.cacheDir, id));
            if (file.indexOf(config.pa.cacheDir) === 0) {
                fsUnlink(file)
                    .then(() => res.status(204).send())
                    .catch(err => {
                        if (err && err.code === 'ENOENT') {
                            res.status(404).send();
                        } else {
                            res.status(500).send(err);
                        }
                    });
            } else {
                res.status(404).send();
            }
        } else if (type === 'aggregator') {
            let aggregator = aggregators.find(agg => agg.id === id);
            if (aggregator) {
                aggregator.process()
                    .then(() => res.status(204).send())
                    .catch(err => res.status(500).send(err));
            } else {
                res.status(404).send();
            }
        } else {
            res.status(404).send();
        }
    });

    app.use('/cache', express.static(config.pa.cacheDir));
    app.get('/logs/:log', (req, res) => {
        let name = req.params.log;
        let mins = req.query.mins === undefined ? 10 : parseFloat(req.query.mins);
        let minDate = moment(req.query.date).subtract(mins, 'minutes');
        let maxDate = moment(req.query.date).add(mins, 'minutes');

        fs.readdir('logs', (err, logs) => {
            let latestLog = logs.filter(l => l.startsWith(name)).sort((a, b) => a < b ? 1 : -1)[0];

            fs.readFile('logs/' + latestLog, (err, data) => {
                if (err) {
                    res.status(404).send();
                } else {
                    var logs = data.toString().split('\n')
                        .filter(s => s)
                        .map(JSON.parse)
                        .filter(l => moment(l.timestamp).isBetween(minDate, maxDate))
                        .reverse()
                    res.send(swig.renderFile('./src/logs.html', {logs}));
                }
            });
        });
    });

    app.listen(3000, () => logger.info('Listening on port 3000'));
}

export default {run}
