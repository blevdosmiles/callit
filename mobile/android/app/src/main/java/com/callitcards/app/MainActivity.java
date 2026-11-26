package com.callitcards.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PartagePlugin.class); // photo reçue depuis « Partager » de la Galerie
        registerPlugin(BullePlugin.class); // bulle flottante du Mode Live
        super.onCreate(savedInstanceState);
    }
}
