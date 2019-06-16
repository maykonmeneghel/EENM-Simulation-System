
    function ss_hinfnap = hinfnap(vd)
        thetahnap=-35; Khnap=6;
        ss_hinfnap=1/(1+exp((vd-thetahnap)/Khnap));
    end

