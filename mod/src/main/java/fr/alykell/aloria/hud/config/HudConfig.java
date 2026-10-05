package fr.alykell.aloria.hud.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.module.HudModule;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class HudConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("aloria-hud.json");

	private final Map<String, ModuleSettings> modules = new LinkedHashMap<>();

	public ModuleSettings get(HudModule module) {
		return modules.computeIfAbsent(module.id(), id -> module.defaults());
	}

	public void reset(HudModule module) {
		modules.put(module.id(), module.defaults());
	}

	public static HudConfig load(List<HudModule> modules) {
		HudConfig config = new HudConfig();
		if (Files.exists(FILE)) {
			try {
				Map<String, ModuleSettings> saved = GSON.fromJson(
					Files.readString(FILE, StandardCharsets.UTF_8),
					new TypeToken<Map<String, ModuleSettings>>() {}.getType()
				);
				if (saved != null) config.modules.putAll(saved);
			} catch (Exception e) {
				AloriaHud.LOGGER.warn("Configuration illisible, valeurs par défaut utilisées", e);
			}
		}
		modules.forEach(config::get);
		return config;
	}

	public void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(modules), StandardCharsets.UTF_8);
		} catch (IOException e) {
			AloriaHud.LOGGER.error("Impossible d'enregistrer la configuration du HUD", e);
		}
	}
}
