import {
  convertMovieToHls,
  decodeMovieHlsText,
  type MovieHlsAsset,
  type MovieHlsOptions,
  type MovieHlsVariantOptions,
} from './hls';
import {
  buildMovieConversionOptions,
  inspectMovie,
  inspectVideoTrackColor,
  type BrowserMovieColorMetadataPolicy,
  type BrowserMovieResizeFit,
  type BrowserMovieResizeOptions,
  type BrowserMovieResizePath,
  type BrowserMovieTrackColor,
  type SceneDetectionOptions,
  type SceneKeyFrameState,
} from './conversion-options';

export type {
  BrowserMovieColorMetadataPolicy,
  BrowserMovieResizeFit,
  BrowserMovieResizeOptions,
  BrowserMovieResizePath,
  BrowserMovieTrackColor,
  MovieHlsAsset,
  MovieHlsOptions,
  MovieHlsVariantOptions,
  SceneDetectionOptions,
  SceneKeyFrameState,
};

export {
  buildMovieConversionOptions,
  convertMovieToHls,
  decodeMovieHlsText,
  inspectMovie,
  inspectVideoTrackColor,
};
