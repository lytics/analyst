/* NPM package builder */

console.log(JSON.stringify({
  'name'        : 'analyst',
  'version'     : require('../analyst.js').version,
  'description' : 'A simple data API abstraction layer',
  'repository': {
    'type' : 'git',
    'url'  : 'http://github.com/lytics/analyst.git'
  },
  'main': './analyst.js',
  'dependencies': {
    'crossfilter' : '1.1.0',
    'd3'          : '2.10.3'
  },
  'devDependencies': {
    'uglify-js' : '1.3.3',
    'watchr'    : '2.1.6',
    'vows'      : '0.6.x'
  },
  'scripts': {
    'test': './node_modules/vows/bin/vows'
  }
}, null, 2));
