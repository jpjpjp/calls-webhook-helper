module.exports = {
    'parser': 'babel-eslint',
    'env': {
        'browser': true,
        'es6': true,
        'node': true
    },
    'parserOptions': {
        'ecmaFeatures': {
            'experimentalObjectRestSpread': true,
            'jsx': true,
            "globalReturn": true
        }, 
    },
    'plugins': [
        'react'
    ],
    'rules': {
        'strict': 0,
        'indent': [
            'warn',
            2,
            {"SwitchCase": 1}
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'no-unused-vars': [
            'warn'
        ],
        'react/jsx-uses-vars': [
            2
        ],
        'semi': [
            'error',
            'always'
        ]
    }
};