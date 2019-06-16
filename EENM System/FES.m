function ym = FES(t,cfg)
    switch cfg.FES.Type
        case {'mono','Mono','MONO','monophasic','Monophasic','MONOPHASIC','monophase','Monophase','MONOPHASE','Monofásico'}
            switch (cfg.FES.Modulation.Where)
                case {'Amplitude','amplitude','Amp','AMP','amp'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym = cfg.FES.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            if t<=switchr
                                scaler=cfg.FES.Amp/cfg.FES.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.FES.Amp)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                ym = (scaler*((t)-cfg.FES.Modulation.tmed)+cfg.FES.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y*sin((t));
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                    end
                case {'Frequency','frequency','Freq','freq','FREQ'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(scaler*(t)*cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym = cfg.FES.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.FES.Fb*(t^2)/cfg.FES.Modulation.tmed,cfg.FES.Wb)+1)/2;
                                ym = cfg.FES.Amp*y;    
                            else 
                                scaler=(-cfg.FES.Fb)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                Freq=(scaler*(t-cfg.FES.tmax));
                                y=(square(2*pi*Freq*(cfg.FES.tmax-t),cfg.FES.Wb)+1)/2;
                                ym = cfg.FES.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(sin(t)*cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                    end
                case {'Pulse Width', 'PW','pulse width'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb*scaler*(t)));
                            ym = cfg.FES.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.FES.Fb*t,cfg.FES.Wb*(t)/cfg.FES.Modulation.tmed)+1)/2;
                                ym = cfg.FES.Amp*y;    
                            else 
                                scaler=(-cfg.FES.Wb)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                Wb=(scaler*(t-cfg.FES.tmax));
                                y=(square(2*pi*cfg.FES.Fb*t,Wb)+1)/2;
                                ym = cfg.FES.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb*sin(t))+1)/2;
                            ym=cfg.FES.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                    end
                otherwise
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym = cfg.FES.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            if t<=switchr
                                scaler=cfg.FES.Amp/cfg.FES.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.FES.Amp)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                ym = (scaler*((t)-cfg.FES.Modulation.tmed)+cfg.FES.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y*sin(t);
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb)+1)/2;
                            ym=cfg.FES.Amp*y;
                    end
            end
        case {'bi','Bi','BI','biphasic','Biphasic','BIPHASIC','biphase','Biphase','BIPHASE','Bifásico'}
            switch (cfg.FES.Modulation.Where)
                case {'Amplitude','amplitude','Amp','AMP','amp'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym = cfg.FES.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            if t<=switchr
                                scaler=cfg.FES.Amp/cfg.FES.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.FES.Amp)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                ym = (scaler*((t)-cfg.FES.Modulation.tmed)+cfg.FES.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y*sin((t));
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                    end
                case {'Frequency','frequency','Freq','freq','FREQ'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(scaler*(t)*cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym = cfg.FES.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.FES.Fb*(t^2)/cfg.FES.Modulation.tmed,cfg.FES.Wb));
                                ym = cfg.FES.Amp*y;    
                            else 
                                scaler=(-cfg.FES.Fb)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                Freq=(scaler*(t-cfg.FES.tmax));
                                y=(square(2*pi*Freq*(cfg.FES.tmax-t),cfg.FES.Wb));
                                ym = cfg.FES.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(sin(t)*cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                    end
                case {'Pulse Width', 'PW','pulse width'}
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb*scaler*(t)));
                            ym = cfg.FES.Amp*y;
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            if t<=switchr
                                y=(square(2*pi*cfg.FES.Fb*t,cfg.FES.Wb*(t)/cfg.FES.Modulation.tmed));
                                ym = cfg.FES.Amp*y;    
                            else 
                                scaler=(-cfg.FES.Wb)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                Wb=(scaler*(t-cfg.FES.tmax));
                                y=(square(2*pi*cfg.FES.Fb*t,Wb));
                                ym = cfg.FES.Amp*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb*sin(t)));
                            ym=cfg.FES.Amp*y;
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                    end
                otherwise
                    switch cfg.FES.Modulation.Type
                        case {'Ramp','ramp','RAMP','Rampa'}
                            scaler = 1/cfg.FES.tmax;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym = cfg.FES.Amp*y*scaler*(t);
                        case {'Step','step','STEP','Degrau'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                        case {'Triangle', 'triangle', 'TRIANGLE','Triangular'}
                            switchr=cfg.FES.Modulation.tmed;
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            if t<=switchr
                                scaler=cfg.FES.Amp/cfg.FES.Modulation.tmed;
                                ym = (scaler*(t))*y;    
                            else
                                scaler=(0-cfg.FES.Amp)/(cfg.FES.tmax-cfg.FES.Modulation.tmed);
                                ym = (scaler*((t)-cfg.FES.Modulation.tmed)+cfg.FES.Amp)*y;       
                            end
                        case {'Sinusoidal', 'sinusoidal', 'SINUSOIDAL','Senoidal'}
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y*sin(t);
                        otherwise % default (Step)
                            y=(square(2*pi*(cfg.FES.Fb*(t)),cfg.FES.Wb));
                            ym=cfg.FES.Amp*y;
                    end
            end       
    end
end
            
            