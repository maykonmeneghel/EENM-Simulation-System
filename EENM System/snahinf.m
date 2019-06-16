
    function ss_snahinf = snahinf(vs)
        snahth=-55.0; snahslp=7.0;
        ss_snahinf=1.0/(1.0+exp((vs-snahth)/snahslp));
    end
