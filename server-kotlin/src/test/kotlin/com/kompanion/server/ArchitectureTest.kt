package com.kompanion.server

import com.kompanion.server.adapter.outbound.persistence.JdbcRunInstances
import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices
import org.junit.jupiter.api.Test
import org.springframework.transaction.annotation.Transactional

// The dependency rule from ARCHITECTURE.md, enforced. The rules cover the
// hexagonal packages (domain, application, adapter); the legacy layered
// packages (controller, service, repository, entity, dto) predate the rule
// and are only held to "don't reach into adapter".
class ArchitectureTest {

    companion object {
        private const val ROOT = "com.kompanion.server"
        private const val DOMAIN = "$ROOT.domain.."
        private const val APPLICATION = "$ROOT.application.."
        private const val ADAPTER = "$ROOT.adapter.."
        private const val CONFIG = "$ROOT.config.."

        // What compiled Kotlin needs no matter what the source says.
        private val LANGUAGE = arrayOf(
            "java.lang..", "java.util..", "java.time..", "java.math..",
            "kotlin..", "org.jetbrains.annotations..",
        )

        private val classes: JavaClasses = ClassFileImporter()
            .withImportOption(ImportOption.DoNotIncludeTests())
            .importPackages(ROOT)
    }

    @Test
    fun `domain is pure Kotlin`() {
        classes().that().resideInAPackage(DOMAIN)
            .should().onlyDependOnClassesThat().resideInAnyPackage(DOMAIN, *LANGUAGE)
            .because("domain would still compile with Spring, Jackson and JDBC off the classpath")
            .check(classes)
    }

    @Test
    fun `application knows only domain plus Service and Transactional`() {
        classes().that().resideInAPackage(APPLICATION)
            .should().onlyDependOnClassesThat().resideInAnyPackage(
                DOMAIN, APPLICATION, *LANGUAGE,
                "org.springframework.stereotype..",
                "org.springframework.transaction.annotation..",
            )
            .because("@Service / @Transactional on use cases is the only sanctioned Spring")
            .check(classes)
    }

    @Test
    fun `nothing outside adapter and config depends on adapter`() {
        noClasses().that().resideOutsideOfPackages(ADAPTER, CONFIG)
            .should().dependOnClassesThat().resideInAPackage(ADAPTER)
            .because("source dependencies point inward")
            .check(classes)
    }

    @Test
    fun `inbound and outbound adapters do not know each other`() {
        noClasses().that().resideInAPackage("$ROOT.adapter.inbound..")
            .should().dependOnClassesThat().resideInAPackage("$ROOT.adapter.outbound..")
            .check(classes)
        noClasses().that().resideInAPackage("$ROOT.adapter.outbound..")
            .should().dependOnClassesThat().resideInAPackage("$ROOT.adapter.inbound..")
            .check(classes)
    }

    @Test
    fun `adapters are free of cycles`() {
        slices().matching("$ROOT.adapter.(*).(*)..")
            .should().beFreeOfCycles()
            .check(classes)
    }

    @Test
    fun `SQL lives only in the persistence adapter`() {
        noClasses().that().resideInAnyPackage(DOMAIN, APPLICATION, ADAPTER)
            .and().resideOutsideOfPackage("$ROOT.adapter.outbound.persistence..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "org.springframework.data..", "org.springframework.jdbc..", "java.sql..",
            )
            .check(classes)
    }

    @Test
    fun `web types live only in the web adapter`() {
        noClasses().that().resideInAnyPackage(DOMAIN, APPLICATION, "$ROOT.adapter.outbound..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "org.springframework.web..", "org.springframework.http..",
            )
            .check(classes)
    }

    @Test
    fun `Transactional belongs on use cases only`() {
        // JdbcRunInstances is the one known exception: its caller is the legacy
        // RunTaskService, not a use case. It goes when RunTaskUseCase lands.
        noClasses().that().resideOutsideOfPackage("$ROOT.application.usecase..")
            .should().beAnnotatedWith(Transactional::class.java)
            .check(classes)
        noMethods().that().areDeclaredInClassesThat().resideOutsideOfPackage("$ROOT.application.usecase..")
            .and().areDeclaredInClassesThat().doNotHaveFullyQualifiedName(JdbcRunInstances::class.java.name)
            .should().beAnnotatedWith(Transactional::class.java)
            .because("the use case is the unit of work; an adapter opening its own transaction is a bug")
            .check(classes)
    }
}
