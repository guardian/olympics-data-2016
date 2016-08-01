import formatTime from './lib/formatTime'
import { $, $$ } from './lib/selector'

formatTime($$('.js-time'), $('.js-tz'));
