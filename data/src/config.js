import _ from 'lodash'
import _cfg from '../config.json'

export let config = _cfg;

export function set(path, value) {
    _.set(config, path, value);
}
