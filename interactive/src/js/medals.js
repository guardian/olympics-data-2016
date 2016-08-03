import './polyfill/classList.min'

import { $, $$ } from './lib/selector'
import RelativeTime from './lib/relative'
import reqwest from 'reqwest'
import { getQueryString } from './lib/queryParameters'

import './schedule'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let tableEl = $('.js-table');
let emptyRowEl = $('.js-row-empty');

let countryCache = {}

RelativeTime.setNow(Date.now())

if ($$('.om-table-row--extra').length > 0) {
    lbButton.style.display = 'block';
    lbButton.addEventListener('click', e => {
        lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
        tableEl.classList.toggle('is-expanded');
        lbButton.classList.toggle('hide-button')
    })

};

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let recentContainer = $('.om-recent-days')
let countryContainer = $('.om-country')
let countrySection = $('.om-country-section')

function ordinal(num) {
    if([11,12,13].indexOf(num % 100) > -1){
        return num + 'th'
    }
    else if(num % 10 === 1){
        return num + 'st'
    }
    else if(num % 10 === 2){
        return num + 'nd'
    }
    else if(num % 10 === 3){
        return num + 'rd'
    }
    return num + 'th'
}

function changeCountry() {
    let identifier = cSelect.options[cSelect.selectedIndex].value;

    function render(country) {
        countrySection.classList.remove('om-section--hidden');
        countryCache[identifier] = country
        countryContainer.innerHTML = country

        $$('.om-country-timestamp').forEach(el => {
            RelativeTime.processEl(el)
        })

        let row = $(`.om-table-row[data-id="${identifier}"]`);
        if (!row) {
            row = emptyRowEl.cloneNode(true);
            row.querySelector('.om-table-row__flag').classList.add(`om-flag--${identifier}`);
            row.querySelector('.om-table-row__country').textContent = identifier;

            $('.om-country-p--unranked').classList.remove('om-is-hidden')
            $('.om-country-p--ranked').classList.add('om-is-hidden')

        }

        else {

            $('.om-country-p--ranked').classList.remove('om-is-hidden')
            $('.om-country-p--unranked').classList.add('om-is-hidden')

            let posSpan = $('.om-position-ordinal')
            posSpan.innerHTML = ordinal(parseInt(row.getAttribute('data-position')))

        }

        let favouriteTable = $('.om-table--favourite')
        favouriteTable.innerHTML = row.outerHTML;

        let cmButton = $('.js-country-medals-button')
        if(cmButton){
            cmButton.addEventListener('click', e => {
                let medals = $$('.om-country-medal-entry')
                medals.slice(5).forEach(m => m.classList.toggle('om-is-hidden'))
                cmButton.innerHTML = (cmButton.innerHTML === 'All medals') ? 'Fewer medals' : 'All medals'
            })
        }
    };

    if(identifier === '') {
        countrySection.classList.add('om-section--hidden');
    } else {
        if(hasStorage()) {
            localStorage.setItem('selectedCountry', identifier);
        }

        if (countryCache[identifier]) {
            render(countryCache[identifier]);
        } else {
            reqwest(`./medals/countries/countryMedals-${identifier}.html`).then(render);
        }
    }
}

function hasStorage() {
    try {
        let mod = new Date;
        localStorage.setItem(mod, mod.toString());
        let result = localStorage.getItem(mod) === mod.toString();
        localStorage.removeItem(mod);
        return result;
    } catch(err) {
        return false;
    }
}

cSelect.addEventListener('change', () => {
    changeCountry()
})

// select edition's country by default (if UK/AUS/US)
let edition = getQueryString('edition');

const editionToCountry = {
    'UK': 'GBR',
    'US': 'USA',
    'AU': 'AUS'
}

if(hasStorage() && localStorage.getItem('selectedCountry')) {
    cSelect.selectedIndex = [].slice.apply(cSelect.options).map(o => o.value).indexOf(localStorage.getItem('selectedCountry'));
    changeCountry()
} else if(edition && edition in editionToCountry) {
    cSelect.selectedIndex = [].slice.apply(cSelect.options).map(o => o.value).indexOf(editionToCountry[edition]);
    changeCountry()
}
