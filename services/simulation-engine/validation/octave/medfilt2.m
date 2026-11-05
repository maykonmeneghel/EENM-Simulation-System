function B = medfilt2(A)
  % MATLAB medfilt2(A) default: 3x3 neighbourhood, zero padding. Octave's refuses inputs narrower than 3.
  [r, c] = size(A); P = zeros(r+2, c+2); P(2:end-1, 2:end-1) = A;
  S = zeros(r, c, 9); n = 0;
  for i = 0:2, for j = 0:2, n = n + 1; S(:,:,n) = P(1+i:r+i, 1+j:c+j); end, end
  B = median(S, 3);
end
