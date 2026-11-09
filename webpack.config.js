var webpack = require('webpack'),
  path = require('path'),
  fileSystem = require('fs-extra'),
  env = require('./utils/env'),
  CopyWebpackPlugin = require('copy-webpack-plugin'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  TerserPlugin = require('terser-webpack-plugin');
var { CleanWebpackPlugin } = require('clean-webpack-plugin');
var ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
var ReactRefreshTypeScript = require('react-refresh-typescript');

const ASSET_PATH = process.env.ASSET_PATH || '/';

var alias = {};

// load the secrets
var secretsPath = path.join(__dirname, 'secrets.' + env.NODE_ENV + '.js');

var fileExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'eot',
  'otf',
  'svg',
  'ttf',
  'woff',
  'woff2',
];

if (fileSystem.existsSync(secretsPath)) {
  alias['secrets'] = secretsPath;
}

const isDevelopment = process.env.NODE_ENV !== 'production';
// E2E 빌드(npm run build:e2e): 에뮬레이터에 붙고 테스트 로그인 경로가 있는 서비스 워커를 build-e2e에 만든다.
const isE2E = process.env.NF_E2E === '1';
const outDir = path.resolve(__dirname, isE2E ? 'build-e2e' : 'build');

// Firebase 웹 설정은 커밋하지 않는 로컬 파일(또는 환경 변수 NF_FIREBASE_CONFIG)에서 넣는다.
// 없으면 null을 넣고, 그 빌드는 "Firebase 설정이 없습니다" 안내를 보인다(4.10-5).
const FIREBASE_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId', 'oauthClientId', 'siteUrl'];
function loadFirebaseConfig() {
  if (isE2E) {
    return { apiKey: 'demo-key', authDomain: 'demo-nf-study.firebaseapp.com', projectId: 'demo-nf-study', appId: 'demo-app' };
  }
  let raw = process.env.NF_FIREBASE_CONFIG;
  const file = path.resolve(__dirname, process.env.NF_FIREBASE_CONFIG_FILE || 'firebase.config.local.json');
  if (!raw && fileSystem.existsSync(file)) raw = fileSystem.readFileSync(file, 'utf8');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const config = Object.fromEntries(FIREBASE_CONFIG_KEYS.filter((k) => parsed[k]).map((k) => [k, String(parsed[k])]));
  return config.apiKey && config.projectId && config.appId ? config : null;
}
const firebaseConfig = loadFirebaseConfig();

var options = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    newtab: path.join(__dirname, 'src', 'pages', 'Newtab', 'index.jsx'),
    options: path.join(__dirname, 'src', 'pages', 'Options', 'index.jsx'),
    popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.tsx'),
    reader: path.join(__dirname, 'src', 'pages', 'Reader', 'index.tsx'),
    // 개발 서버에서만: chrome.* 대신 메모리 저장소로 원서 리더를 띄운다(4.10-2).
    ...(isDevelopment
      ? {
          readerDev: path.join(__dirname, 'src', 'pages', 'Reader', 'dev.tsx'),
          // 넷플릭스 밖에서 학습 패널의 로그인 안내 상태를 보는 개발 화면(4.11-3).
          netflixDev: path.join(__dirname, 'src', 'pages', 'Content', 'dev.tsx'),
        }
      : {}),
    background: path.join(__dirname, 'src', 'pages', 'Background', isE2E ? 'e2e.ts' : 'index.ts'),
    contentScript: path.join(__dirname, 'src', 'pages', 'Content', 'index.tsx'),
    contentLoader: path.join(
      __dirname,
      'src',
      'pages',
      'ContentLoader',
      'index.ts'
    ),
    devtools: path.join(__dirname, 'src', 'pages', 'Devtools', 'index.js'),
    panel: path.join(__dirname, 'src', 'pages', 'Panel', 'index.jsx'),
  },
  netflixSubtitleStudy: {
    notHotReload: ['background', 'contentScript', 'devtools', 'contentLoader'],
  },
  output: {
    filename: '[name].bundle.js',
    path: outDir,
    clean: true,
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        // look for .css or .scss files
        test: /\.(css|scss)$/,
        // in the `src` directory
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        type: 'asset/resource',
        exclude: /node_modules/,
        // loader: 'file-loader',
        // options: {
        //   name: '[name].[ext]',
        // },
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('ts-loader'),
            options: {
              getCustomTransformers: () => ({
                before: [isDevelopment && ReactRefreshTypeScript()].filter(
                  Boolean
                ),
              }),
              transpileOnly: isDevelopment,
            },
          },
        ],
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: 'source-map-loader',
          },
          {
            loader: require.resolve('babel-loader'),
            options: {
              plugins: [
                isDevelopment && require.resolve('react-refresh/babel'),
              ].filter(Boolean),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: alias,
    extensions: fileExtensions
      .map((extension) => '.' + extension)
      .concat(['.js', '.jsx', '.ts', '.tsx', '.css']),
  },
  plugins: [
    isDevelopment && new ReactRefreshWebpackPlugin(),
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(['NODE_ENV']),
    new webpack.DefinePlugin({
      __NF_FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          to: outDir,
          force: true,
          transform: function (content, path) {
            // generates the manifest file using the package.json informations
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              })
            );
          },
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/pages/Content/content.styles.css',
          to: outDir,
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/assets/img/icon-128.png',
          to: outDir,
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/assets/img/icon-34.png',
          to: outDir,
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Newtab', 'index.html'),
      filename: 'newtab.html',
      chunks: ['newtab'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Options', 'index.html'),
      filename: 'options.html',
      chunks: ['options'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Reader', 'index.html'),
      filename: 'reader.html',
      chunks: ['reader'],
      cache: false,
    }),
    isDevelopment &&
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'src', 'pages', 'Reader', 'index.html'),
        filename: 'reader-dev.html',
        chunks: ['readerDev'],
        cache: false,
      }),
    isDevelopment &&
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'src', 'pages', 'Content', 'dev.html'),
        filename: 'netflix-dev.html',
        chunks: ['netflixDev'],
        cache: false,
      }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Devtools', 'index.html'),
      filename: 'devtools.html',
      chunks: ['devtools'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Panel', 'index.html'),
      filename: 'panel.html',
      chunks: ['panel'],
      cache: false,
    }),
  ].filter(Boolean),
  infrastructureLogging: {
    level: 'info',
  },
};

if (env.NODE_ENV === 'development') {
  options.devtool = 'cheap-module-source-map';
} else {
  options.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  };
}

module.exports = options;
