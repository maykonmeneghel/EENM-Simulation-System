
    function ss_scahinf = scahinf(vs)
        cahth=-45.0; cahslp=5.0;
        ss_scahinf=1.0/(1.0+exp((vs-cahth)/cahslp));
    end

