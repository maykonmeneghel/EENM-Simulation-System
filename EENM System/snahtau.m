
    function ss_snahtau = snahtau(vs)
        snahv=-50.0; snaha=15.0; snahb=16.0; snahc=30.0;
        ss_snahtau=snahc/(exp((vs-snahv)/snaha)+exp(-(vs-snahv)/snahb));
    end

