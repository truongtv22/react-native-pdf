/**
* Copyright (c) 2017-present, Wonday (@wonday.org)
* All rights reserved.
*
* This source code is licensed under the MIT-style license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
    ActivityIndicator,
    requireNativeComponent,
    View,
    Platform,
    ProgressBarAndroid,
    ProgressViewIOS,
    ViewPropTypes
} from 'react-native';

import RNFetchBlob from 'react-native-fetch-blob';
import PDFView from 'react-native-pdf-view';

const SHA1 = require('crypto-js/sha1');
import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';
// import PdfView from './PdfView';

export default class Pdf extends Component {


    static propTypes = {
        ...ViewPropTypes,
        path: PropTypes.string,
        source: PropTypes.oneOfType([
            PropTypes.shape({
                uri: PropTypes.string,
                cache: PropTypes.bool,
            }),
            // Opaque type returned by require('./test.pdf')
            PropTypes.number,
        ]).isRequired,
        page: PropTypes.number,
        scale: PropTypes.number,
        horizontal: PropTypes.bool,
        spacing: PropTypes.number,
        password: PropTypes.string,
        progressBarColor: PropTypes.string,
        activityIndicator: PropTypes.any,
        activityIndicatorProps: PropTypes.any,
        enableAntialiasing: PropTypes.bool,
        fitPolicy: PropTypes.number,
        onLoadComplete: PropTypes.func,
        onPageChanged: PropTypes.func,
        onError: PropTypes.func,
        onPageSingleTap: PropTypes.func,
        onScaleChanged: PropTypes.func,
    };

    static defaultProps = {
        password: "",
        scale: 1,
        spacing: 10,
        fitPolicy: 2, //fit both
        horizontal: false,
        page: 1,
        activityIndicatorProps: {color:'#009900',progressTintColor:'#009900'},
        onLoadProgress: (percent) => { },
        onLoadComplete: (numberOfPages, path) => { },
        onPageChanged: (page, numberOfPages) => { },
        onError: (error) => { },
        onPageSingleTap: (page) => { },
        onScaleChanged: (scale) => { },
    };
    constructor(props) {

        super(props);
        this.state = {
            path: '',
            isDownloaded: false,
            progress: 0,
       };

        this.uri = '';
        this.lastRNBFTask = null;

    }

    componentWillReceiveProps(nextProps) {

        if (nextProps.source !== this.props.source) {
            //__DEV__ && console.log("componentWillReceiveProps: source changed");
            this._loadFromSource(nextProps.source);
        }

    }

    componentDidMount() {

        this._loadFromSource(this.props.source);

    }

    componentWillUnmount() {

        if (this.lastRNBFTask) {
            this.lastRNBFTask.cancel(err => {
                //__DEV__ && console.log("Load pdf from url was cancelled.");
            });
            this.lastRNBFTask = null;
        }

    }

    _loadFromSource = (newSource) => {

        const source = resolveAssetSource(newSource) || {};
        //__DEV__ && console.log("PDF source:");
        //__DEV__ && console.log(source);

        let uri = source.uri || '';

        // no chanage then return
        if (this.uri === uri) return;
        this.uri = uri;

        // first set to initial state
        this.setState({ isDownloaded: false, path: '', progress: 0 });

        const tempCacheFile = RNFetchBlob.fs.dirs.CacheDir + '/' + SHA1(uri) + '.pdf.tmp';
        const cacheFile = RNFetchBlob.fs.dirs.CacheDir + '/' + SHA1(uri) + '.pdf';

        if (source.cache) {
            RNFetchBlob.fs
                .exists(tempCacheFile)
                .then(exist => {
                    if (exist) {
                        // delete temp file
                        RNFetchBlob.fs.unlink(tempCacheFile);
                        // download from source
                        this._prepareFile(source)
                    } else {
                        RNFetchBlob.fs
                            .exists(cacheFile)
                            .then(exist => {
                                if (exist) {
                                    this.setState({ path: cacheFile, isDownloaded: true })
                                } else {
                                    // cache not exist then re load it
                                    this._prepareFile(source)
                                }
                            })
                            .catch(() => {
                                this._prepareFile(source)
                            })
                    }
                })
                .catch(() => {
                    this._prepareFile(source)
                })
        } else {
            this._prepareFile(source)
        }

    };

    _prepareFile = (source) => {

        if (source.uri) {
            let uri = source.uri || '';

            const isNetwork = !!(uri && uri.match(/^https?:\/\//));
            const isAsset = !!(uri && uri.match(/^bundle-assets:\/\//));
            const isBase64 = !!(uri && uri.match(/^data:application\/pdf;base64/));

            const tempCacheFile = RNFetchBlob.fs.dirs.CacheDir + '/' + SHA1(uri) + '.pdf.tmp';
            const cacheFile = RNFetchBlob.fs.dirs.CacheDir + '/' + SHA1(uri) + '.pdf';

            // delete old cache file
            RNFetchBlob.fs.unlink(tempCacheFile);
            RNFetchBlob.fs.unlink(cacheFile);

            if (isNetwork) {
                this._downloadFile(source, tempCacheFile, cacheFile)
            } else if (isAsset) {
                RNFetchBlob.fs
                    .cp(uri, cacheFile)
                    .then(() => {
                        //__DEV__ && console.log("load from asset:"+uri);
                        this.setState({ path: cacheFile, isDownloaded: true })
                    })
                    .catch(error => {
                        RNFetchBlob.fs.unlink(cacheFile);
                        console.warn('load from asset error');
                        console.log(error);
                        this.props.onError && this.props.onError('load pdf failed.')
                    })
            } else if (isBase64) {
                let data = uri.replace(/data:application\/pdf;base64,/i, '');
                RNFetchBlob.fs
                    .writeFile(cacheFile, data, 'base64')
                    .then(() => {
                        //__DEV__ && console.log("write base64 to file:" + cacheFile);
                        this.setState({ path: cacheFile, isDownloaded: true })
                    })
                    .catch(() => {
                        RNFetchBlob.fs.unlink(this.path);
                        console.warn('write base64 file error!');
                        this.props.onError && this.props.onError('load pdf failed.')
                    })
            } else {
                //__DEV__ && console.log("default source type as file");
                this.setState({
                    path: uri.replace(/file:\/\//i, ''),
                    isDownloaded: true,
                })
            }
        } else {
            console.error('no pdf source!');
        }

    };

    _downloadFile = (source, tempCacheFile, cacheFile) => {

        if (this.lastRNBFTask) {
            this.lastRNBFTask.cancel(err => {
                RNFetchBlob.fs.unlink(tempCacheFile);
                //__DEV__ && console.log("Load pdf from url was cancelled.");
            });
            this.lastRNBFTask = null;
        }

        this.lastRNBFTask = RNFetchBlob.config({
            // response data will be saved to this path if it has access right.
            path: tempCacheFile,
        })
            .fetch(
            source.method ? source.method : 'GET',
            source.uri,
            source.headers ? source.headers : {}
            )
            // listen to download progress event
            .progress((received, total) => {
                //__DEV__ && console.log('progress', received / total);
                this.props.onLoadProgress && this.props.onLoadProgress(received / total);
                this.setState({ progress: received / total })
            });

        this.lastRNBFTask
            .then(res => {
                let { status } = res.respInfo;

                this.lastRNBFTask = null;

                //__DEV__ && console.log('Load pdf from url and saved to ', res.path())

                switch (status) {
                    case 200: /* OK */
                    case 204: /* No content */
                    case 304: /* Not modified */
                    {
                        RNFetchBlob.fs
                            .mv(tempCacheFile,cacheFile)
                            .then(() => {
                                //__DEV__ && console.log("load from asset:"+uri);
                                this.setState({ path: cacheFile, isDownloaded: true, progress: 1 });
                            });
                        break;
                    }
                    default:
                        RNFetchBlob.fs.unlink(tempCacheFile);
                        this.props.onError && this.props.onError(`load pdf failed with code ${status}`);
                        break;
                }
            })
            .catch(error => {
                console.warn(`download ${source.uri} error:${error}.`);
                this.lastRNBFTask = null;
                RNFetchBlob.fs.unlink(tempCacheFile);
                this.props.onError && this.props.onError('load pdf failed.')
            });

    };

    setNativeProps = nativeProps => {

        this._root.setNativeProps(nativeProps);

    };

    _onChange = (event) => {

        let message = event.nativeEvent.message.split('|');
        //__DEV__ && console.log("onChange: " + message);
        if (message.length > 0) {
            if (message[0] === 'loadComplete') {
                this.props.onLoadComplete && this.props.onLoadComplete(Number(message[1]), this.state.path);
            } else if (message[0] === 'pageChanged') {
                this.props.onPageChanged && this.props.onPageChanged(Number(message[1]), Number(message[2]));
            } else if (message[0] === 'error') {
                this._onError(message[1]);
            } else if (message[0] === 'pageSingleTap') {
                this.props.onPageSingleTap && this.props.onPageSingleTap(message[1]);
            } else if (message[0] === 'scaleChanged') {
                this.props.onScaleChanged && this.props.onScaleChanged(message[1]);
            }
        }

    };
    _onError = (error) => {

        this.props.onError && this.props.onError(error);

    }

    render() {

        if (!this.state.isDownloaded) {
            return (
                <View
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                >
                    {this.props.activityIndicator
                        ? this.props.activityIndicator
                        : Platform.OS === 'android'
                            ? <ProgressBarAndroid
                                progress={this.state.progress}
                                indeterminate={false}
                                styleAttr="Horizontal"
                                style={{ width: 200, height: 2 }}
                                {...this.props.activityIndicatorProps}
                            />
                            : <ProgressViewIOS
                                progress={this.state.progress}
                                style={{ width: 200, height: 2 }}
                                {...this.props.activityIndicatorProps}
                            />}
                </View>
            )
        } else {
            if (Platform.OS === "android") {
                return (
                    <PDFView
                        ref={(pdf)=>{this.pdfView = pdf;}}
                        src={this.state.path}
                        pageNumber={this.props.page}
                        onLoadComplete = {(pageCount)=>{
                            console.log('pageCount: ', pageCount);
                        }}
                        style={{flex: 1}}
                    />
                    // <PdfCustom
                    //     ref={component => (this._root = component)}
                    //     {...this.props}
                    //     style={[{ backgroundColor: '#EEE' }, this.props.style]}
                    //     path={this.state.path}
                    //     onChange={this._onChange}
                    // />
                );
            } else if (Platform.OS === "ios") {
                return (
                    <PdfView
                        {...this.props}
                        style={[{ backgroundColor: '#EEE' }, this.props.style]}
                        path={this.state.path}
                        onLoadComplete={this.props.onLoadComplete}
                        onPageChanged={this.props.onPageChanged}
                        onError={this._onError}
                        onPageSingleTap={this.props.onPageSingleTap}
                        onScaleChanged={this.props.onScaleChanged}
                    />
                );
            } else {
                return (null);
            }
        }

    }
}


if (Platform.OS === "android") {
    var PdfCustom = requireNativeComponent('RCTPdf', Pdf, {
        nativeOnly: { path: true, onChange: true },
    })
}
