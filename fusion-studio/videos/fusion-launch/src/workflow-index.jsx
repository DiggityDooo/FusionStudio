import React from 'react';
import {registerRoot,Composition} from 'remotion';
import take from '../public/workflow/take.json';
import {WorkflowFilm} from './workflow.jsx';
registerRoot(()=> <Composition id="FusionWorkflow" component={WorkflowFilm} width={1920} height={1080} fps={30} durationInFrames={take.frames} defaultProps={{take}}/>);
