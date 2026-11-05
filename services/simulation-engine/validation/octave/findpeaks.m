function [pks, locs] = findpeaks(y, name, h)
  % MATLAB findpeaks(y,'MinPeakHeight',h) per its documentation: interior local maxima,
  % flat peaks reported at their first sample, endpoints never peaks, height strictly > h.
  y = y(:); n = numel(y); locs = zeros(0,1);
  i = 2;
  while i < n
    if y(i) > y(i-1)
      j = i; while j < n && y(j+1) == y(i), j = j + 1; end
      if j < n && y(j+1) < y(i), locs(end+1,1) = i; end %#ok<AGROW>
      i = j + 1;
    else
      i = i + 1;
    end
  end
  locs = locs(y(locs) > h); pks = y(locs);
end
