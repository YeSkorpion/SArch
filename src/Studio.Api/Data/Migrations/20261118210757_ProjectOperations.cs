using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Studio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProjectOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "area_id",
                table: "requirements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "assignee_id",
                table: "package_comments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "artifact_sources",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    artifact_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    target = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    checked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    checked_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    checked_by_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    checked_reference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    checked_target = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_artifact_sources", x => x.id);
                    table.ForeignKey(
                        name: "fk_artifact_sources_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "catalog_tables",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    area_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    purpose = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    document_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_catalog_tables", x => x.id);
                    table.ForeignKey(
                        name: "fk_catalog_tables_areas_area_id",
                        column: x => x.area_id,
                        principalTable: "areas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_catalog_tables_documents_document_id",
                        column: x => x.document_id,
                        principalTable: "documents",
                        principalColumn: "artifact_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_catalog_tables_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "coverage_waivers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    reason = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coverage_waivers", x => x.id);
                    table.ForeignKey(
                        name: "fk_coverage_waivers_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_coverage_waivers_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalTable: "requirements",
                        principalColumn: "artifact_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "flow_entries",
                columns: table => new
                {
                    diagram_id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    screen_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_flow_entries", x => x.diagram_id);
                    table.ForeignKey(
                        name: "fk_flow_entries_diagrams_diagram_id",
                        column: x => x.diagram_id,
                        principalTable: "diagrams",
                        principalColumn: "artifact_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_flow_entries_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "catalog_columns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    table_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    is_primary_key = table.Column<bool>(type: "boolean", nullable: false),
                    foreign_table_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_catalog_columns", x => x.id);
                    table.ForeignKey(
                        name: "fk_catalog_columns_catalog_tables_foreign_table_id",
                        column: x => x.foreign_table_id,
                        principalTable: "catalog_tables",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_catalog_columns_catalog_tables_table_id",
                        column: x => x.table_id,
                        principalTable: "catalog_tables",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_catalog_columns_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_requirements_area_id",
                table: "requirements",
                column: "area_id");

            migrationBuilder.CreateIndex(
                name: "ix_artifact_sources_project_id_artifact_id",
                table: "artifact_sources",
                columns: new[] { "project_id", "artifact_id" });

            migrationBuilder.CreateIndex(
                name: "ix_catalog_columns_foreign_table_id",
                table: "catalog_columns",
                column: "foreign_table_id");

            migrationBuilder.CreateIndex(
                name: "ix_catalog_columns_project_id",
                table: "catalog_columns",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_catalog_columns_table_id_position",
                table: "catalog_columns",
                columns: new[] { "table_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_catalog_tables_area_id",
                table: "catalog_tables",
                column: "area_id");

            migrationBuilder.CreateIndex(
                name: "ix_catalog_tables_document_id",
                table: "catalog_tables",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "ix_catalog_tables_project_id_name",
                table: "catalog_tables",
                columns: new[] { "project_id", "name" });

            migrationBuilder.CreateIndex(
                name: "ix_coverage_waivers_project_id",
                table: "coverage_waivers",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_coverage_waivers_requirement_id_kind",
                table: "coverage_waivers",
                columns: new[] { "requirement_id", "kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_flow_entries_project_id",
                table: "flow_entries",
                column: "project_id");

            migrationBuilder.AddForeignKey(
                name: "fk_requirements_areas_area_id",
                table: "requirements",
                column: "area_id",
                principalTable: "areas",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_requirements_areas_area_id",
                table: "requirements");

            migrationBuilder.DropTable(
                name: "artifact_sources");

            migrationBuilder.DropTable(
                name: "catalog_columns");

            migrationBuilder.DropTable(
                name: "coverage_waivers");

            migrationBuilder.DropTable(
                name: "flow_entries");

            migrationBuilder.DropTable(
                name: "catalog_tables");

            migrationBuilder.DropIndex(
                name: "ix_requirements_area_id",
                table: "requirements");

            migrationBuilder.DropColumn(
                name: "area_id",
                table: "requirements");

            migrationBuilder.DropColumn(
                name: "assignee_id",
                table: "package_comments");
        }
    }
}
