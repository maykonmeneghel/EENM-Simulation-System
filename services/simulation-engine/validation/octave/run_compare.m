% Runs main_harness.m (generated from Main.m) with the MUAP shapes of the Python run; saves the outputs.
pkg load signal; pkg load image;
addpath('/model');
TMAX = str2double(getenv('TMAX'));
s = load(getenv('PYMAT'));
SHAPE_S = s.shape_S; SHAPE_FR = s.shape_FR; SHAPE_FF = s.shape_FF;
tic; main_harness; el = toc;
printf('octave total: %.1fs\n', el);
time2 = EENMResults.Parameters.time2; Vs = [Data_S{1} Data_FR{1} Data_FF{1}];
force = EENMResults.force;
save('-v7', getenv('OUTMAT'), 'Vs', 'force', 'f_S', 'f_FR', 'f_FF', 'UMAP_S', 'UMAP_FR', 'UMAP_FF', 'time2', 'el');
