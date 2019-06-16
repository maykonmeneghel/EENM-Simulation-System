function ym = FES(t,cfg)
    switch cfg.EENM.Type
        case {'mono','Mono','MONO','monophasic','Monophasic','MONOPHASIC','monophase','Monophase','MONOPHASE','Monofásico'}
            switch (cfg.EENM.Modulation.Where)
                case {'Amplitude','amplitude','Amp','AMP','amp'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym = cfg.EENM.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            if t<=switchr
                                scaler=cfg.EENM.Amp/cfg.EENM.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.EENM.Amp)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                ym = (scaler*((t)-cfg.EENM.Modulation.tmed)+cfg.EENM.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y*sin((t));
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                    end
                case {'Frequency','frequency','Freq','freq','FREQ'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(scaler*(t)*cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym = cfg.EENM.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.EENM.Fb*(t^2)/cfg.EENM.Modulation.tmed,cfg.EENM.Wb)+1)/2;
                                ym = cfg.EENM.Amp*y;    
                            else 
                                scaler=(-cfg.EENM.Fb)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                Freq=(scaler*(t-cfg.EENM.tmax));
                                y=(square(2*pi*Freq*(cfg.EENM.tmax-t),cfg.EENM.Wb)+1)/2;
                                ym = cfg.EENM.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(sin(t)*cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                    end
                case {'Pulse Width', 'PW','pulse width'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb*scaler*(t)));
                            ym = cfg.EENM.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.EENM.Fb*t,cfg.EENM.Wb*(t)/cfg.EENM.Modulation.tmed)+1)/2;
                                ym = cfg.EENM.Amp*y;    
                            else 
                                scaler=(-cfg.EENM.Wb)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                Wb=(scaler*(t-cfg.EENM.tmax));
                                y=(square(2*pi*cfg.EENM.Fb*t,Wb)+1)/2;
                                ym = cfg.EENM.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb*sin(t))+1)/2;
                            ym=cfg.EENM.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                    end
                otherwise
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym = cfg.EENM.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            if t<=switchr
                                scaler=cfg.EENM.Amp/cfg.EENM.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.EENM.Amp)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                ym = (scaler*((t)-cfg.EENM.Modulation.tmed)+cfg.EENM.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y*sin(t);
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb)+1)/2;
                            ym=cfg.EENM.Amp*y;
                    end
            end
        case {'bi','Bi','BI','biphasic','Biphasic','BIPHASIC','biphase','Biphase','BIPHASE','Bifásico'}
            switch (cfg.EENM.Modulation.Where)
                case {'Amplitude','amplitude','Amp','AMP','amp'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym = cfg.EENM.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            if t<=switchr
                                scaler=cfg.EENM.Amp/cfg.EENM.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.EENM.Amp)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                ym = (scaler*((t)-cfg.EENM.Modulation.tmed)+cfg.EENM.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y*sin((t));
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                    end
                case {'Frequency','frequency','Freq','freq','FREQ'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(scaler*(t)*cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym = cfg.EENM.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.EENM.Fb*(t^2)/cfg.EENM.Modulation.tmed,cfg.EENM.Wb));
                                ym = cfg.EENM.Amp*y;    
                            else 
                                scaler=(-cfg.EENM.Fb)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                Freq=(scaler*(t-cfg.EENM.tmax));
                                y=(square(2*pi*Freq*(cfg.EENM.tmax-t),cfg.EENM.Wb));
                                ym = cfg.EENM.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(sin(t)*cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                    end
                case {'Pulse Width', 'PW','pulse width'}
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb*scaler*(t)));
                            ym = cfg.EENM.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.EENM.Fb*t,cfg.EENM.Wb*(t)/cfg.EENM.Modulation.tmed));
                                ym = cfg.EENM.Amp*y;    
                            else 
                                scaler=(-cfg.EENM.Wb)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                Wb=(scaler*(t-cfg.EENM.tmax));
                                y=(square(2*pi*cfg.EENM.Fb*t,Wb));
                                ym = cfg.EENM.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb*sin(t)));
                            ym=cfg.EENM.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                    end
                otherwise
                    switch cfg.EENM.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.EENM.tmax;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym = cfg.EENM.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.EENM.Modulation.tmed;
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            if t<=switchr
                                scaler=cfg.EENM.Amp/cfg.EENM.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.EENM.Amp)/(cfg.EENM.tmax-cfg.EENM.Modulation.tmed);
                                ym = (scaler*((t)-cfg.EENM.Modulation.tmed)+cfg.EENM.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y*sin(t);
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.EENM.Fb*(t)),cfg.EENM.Wb));
                            ym=cfg.EENM.Amp*y;
                    end
            end       
    end
end
            
            