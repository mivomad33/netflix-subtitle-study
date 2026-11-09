// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  path = require('path'),
  fs = require('fs'),
  config = require('../webpack.config'),
  ZipPlugin = require('zip-webpack-plugin');

delete config.netflixSubtitleStudy;

config.mode = 'production';

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// E2E 빌드는 압축 파일을 만들지 않는다.
if (process.env.NF_E2E !== '1') {
  config.plugins = (config.plugins || []).concat(
    new ZipPlugin({
      filename: `${packageInfo.name}-${packageInfo.version}.zip`,
      path: path.join(__dirname, '../', 'zip'),
    })
  );
}

webpack(config, function (err, stats) {
  if (err) throw err;
  if (stats && stats.hasErrors()) {
    console.error(stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
  }
});
