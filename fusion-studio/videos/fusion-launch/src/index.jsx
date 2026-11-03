import React from 'react';
import {registerRoot,Composition} from 'remotion';
import {LaunchFilm} from './launch.jsx';
import {film} from './story.mjs';
registerRoot(()=> <Composition id="FusionLaunch" component={LaunchFilm} {...film} defaultProps={{preview:true}} />);
