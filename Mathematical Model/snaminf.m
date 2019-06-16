%%     %% Voltage-dependent functions for ion channel gating
    %% % Somatic channel gating functions
    function ss_snaminf = snaminf(vs)
        snamth=-35.0; snamslp=7.8;
        ss_snaminf=1/(1+exp(-(vs-snamth)/snamslp));
    end

